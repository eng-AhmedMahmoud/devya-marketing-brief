// One draft-mode run: list every article, read each comment tree, skip what
// was seen before / is his own / he already answered / is deleted; collect how
// earlier drafts and replies did and distil it into the next lessons version
// (feedback.mjs); then flag spam and abuse, draft the rest with the current
// lessons and queue them for review. Read-only on dev.to.

import { draftBatch, spamCheck } from './drafts.mjs';
import { decisionEvents, distill, loadLessons, markReported, mergeOutcomes, replyOutcomes } from './feedback.mjs';
import { enqueue, markSeen } from './store.mjs';
import { classify, clip, commentUrl, flattenTree, threadOf } from './threads.mjs';
import { renderQueue } from './view.mjs';

const BATCH = 10;

export async function runScan({
  client,
  store,
  username,
  runModel,
  distiller = null,
  minEvents = 3,
  drafter = 'claude',
  now = () => new Date(),
  maxDrafts = 30,
  maxFailures = 3,
  dryRun = false,
  noDraft = false,
  allArticles = false,
}) {
  const at = now().toISOString();
  const state = store.loadState();
  const queue = store.loadQueue();
  const s = { at, mode: noDraft ? 'list' : dryRun ? 'dry-run' : 'draft', articles: 0, scanned: 0, comments: 0, seenBefore: 0, own: 0, answered: 0, deleted: 0, newComments: 0, drafted: 0, flagged: 0, failed: 0, deferred: 0, pending: 0, limit: null };
  const write = !dryRun && !noDraft;
  const added = [];

  const articles = await client.listArticles(username);
  s.articles = articles.length;
  const work = [];
  const postedLedger = store.posted();
  const freshOutcomes = [];
  const articleReactions = {};
  for (const a of articles) {
    if (!allArticles && Number(a.comments_count) === 0) continue;
    const flat = flattenTree(await client.listComments(a.id), { articleId: a.id });
    articleReactions[a.id] = a.public_reactions_count ?? null;
    if (postedLedger.length) freshOutcomes.push(...replyOutcomes(flat, postedLedger, username));
    s.scanned++;
    s.comments += flat.length;
    const c = classify(flat, { me: username, seen: state.seen });
    s.seenBefore += c.seen.length;
    s.own += c.own.length;
    s.answered += c.answered.length;
    s.deleted += c.deleted.length;
    s.newComments += c.toDraft.length;
    if (write) {
      markSeen(state, c.own, 'own', at);
      markSeen(state, c.answered, 'answered', at);
      markSeen(state, c.deleted, 'deleted', at);
    }
    if (c.toDraft.length) work.push({ article: a, items: c.toDraft.map((n) => ({ ...n, thread: threadOf(n, flat) })) });
  }

  // Feedback loop, before any drafting so the drafter reads the newest lessons.
  const outcomes = store.loadOutcomes();
  const outcomeEvents = mergeOutcomes(outcomes, freshOutcomes, { articleReactions, at });
  const fb = { decisionsSince: '', ...state.feedback };
  const events = [...decisionEvents(queue, store.decisions(), { since: fb.decisionsSince }), ...outcomeEvents];
  s.feedbackEvents = events.length;
  s.repliesTracked = Object.keys(outcomes).length;
  if (write && distiller) {
    const d = await distill({ store, events, runModel: distiller, minEvents, at });
    s.lessons = `${d.status}${d.reason ? ` (${d.reason})` : ''}${d.changes ? `: ${d.changes}` : ''}`;
    if (d.status === 'limit') s.limit = d.reason.split(' ')[0];
    if (d.consumed) {
      const last = events.filter((e) => e.type !== 'reply-outcome').map((e) => e.at).sort().at(-1);
      if (last) fb.decisionsSince = last;
      markReported(outcomes, events);
    }
  } else {
    s.lessons = write ? 'distiller off' : `not distilled in ${s.mode} mode`;
  }
  s.lessonsVersion = loadLessons(store).version;
  if (write) { state.feedback = fb; store.saveOutcomes(outcomes); }

  const base = (it, a) => ({
    id: it.id, commentId: it.id, articleId: a.id, articleTitle: a.title, articleUrl: a.url, commentUrl: commentUrl(it),
    author: it.author, authorName: it.name, commentAt: it.createdAt, comment: clip(it.text, 2000), thread: it.thread, createdAt: at, updatedAt: at,
  });
  const put = (item, outcome) => {
    added.push(item);
    if (!write) return;
    enqueue(queue, item);
    markSeen(state, [{ id: item.commentId, articleId: item.articleId }], outcome, at);
  };
  const flag = (it, a, reason, by) => { s.flagged++; put({ ...base(it, a), kind: 'flag', reason, flaggedBy: by, status: 'flagged' }, 'flagged'); };
  const reply = (it, a, d) => { s.drafted++; put({ ...base(it, a), kind: 'reply', lang: d.lang, reply: d.reply, draftedBy: drafter, status: 'pending' }, 'drafted'); };
  const fail = (it, a, why) => {
    s.failed++;
    if (!write) return;
    const n = (state.failures[it.id] = (state.failures[it.id] || 0) + 1);
    if (n >= maxFailures) flag(it, a, `could not draft after ${n} runs: ${why.join('; ')}`, 'routine');
  };

  let budget = noDraft ? 0 : maxDrafts;
  for (const w of work) {
    if (noDraft) { s.deferred += w.items.length; continue; }
    const candidates = [];
    for (const it of w.items) {
      const sc = spamCheck(it.text);
      if (sc.spam) flag(it, w.article, sc.reason, 'heuristic');
      else candidates.push(it);
    }
    const toModel = candidates.slice(0, Math.max(0, budget));
    s.deferred += candidates.length - toModel.length;
    budget -= toModel.length;
    if (!toModel.length) continue;
    if (s.limit) { s.deferred += toModel.length; continue; }
    const article = { ...w.article, ...(await client.getArticle(w.article.id)) };
    for (let i = 0; i < toModel.length; i += BATCH) {
      const chunk = toModel.slice(i, i + BATCH);
      if (s.limit) { s.deferred += chunk.length; continue; }
      const r = await draftBatch({ me: username, article, items: chunk, runModel });
      if (r.limit) s.limit = r.limit;
      for (const it of chunk) {
        const d = r.drafts.get(it.id);
        if (d?.action === 'flag') flag(it, w.article, d.reason, 'drafter');
        else if (d?.action === 'reply') reply(it, w.article, d);
        else if (r.limit) s.deferred++;
        else fail(it, w.article, r.failed.get(it.id) || ['no draft']);
      }
    }
  }

  s.pending = queue.items.filter((x) => x.status === 'pending').length;
  if (write) {
    state.lastRun = s;
    store.saveState(state);
    store.saveQueue(queue);
    store.writeText('queue.md', renderQueue(queue));
    store.addRun(s);
  } else if (dryRun) {
    const stamp = at.replace(/[:.]/g, '-');
    store.writeText(`dry/${stamp}.json`, `${JSON.stringify(added, null, 2)}\n`);
    store.writeText(`dry/${stamp}.md`, renderQueue({ items: added }, { title: `dev.to reply drafts (dry run ${at})`, all: true }));
    s.dryFile = store.path(`dry/${stamp}.md`);
  }
  const listed = work.flatMap((w) => w.items.map((it) => ({ id: it.id, article: w.article.title, author: it.author, url: commentUrl(it), text: clip(it.text, 160) })));
  return { summary: s, added, listed };
}

export function summaryLine(s) {
  const parts = [
    `${s.articles} article(s), ${s.scanned} with comments, ${s.comments} comment(s)`,
    `${s.newComments} new → ${s.drafted} drafted, ${s.flagged} flagged, ${s.failed} failed, ${s.deferred} deferred`,
    `skipped: ${s.seenBefore} seen before, ${s.own} own, ${s.answered} already answered, ${s.deleted} deleted`,
  ];
  parts.push(`feedback: ${s.feedbackEvents ?? 0} new event(s), ${s.repliesTracked ?? 0} posted repl(y/ies) tracked; lessons v${s.lessonsVersion ?? 0}: ${s.lessons ?? '-'}`);
  if (s.mode === 'draft') parts.push(`queue: ${s.pending} pending review`);
  if (s.limit) parts.push(`stopped on a ${s.limit} usage limit`);
  return `dev.to (${s.mode}): ${parts.join(' · ')}`;
}
