// Discovery: candidates, comment checks, caps, no duplicate threads, and the
// gate for comments, reactions and follows. node --test social/devto/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient, createWriter } from './forem.mjs';
import { checkComment, findCandidates, loadConfig, ownTags, parseDecision, queuedToday, runDiscovery } from './discover.mjs';
import { approve, edit, payloadOf, postPlan, postReactions, recheck, recordPosted, sha256 } from './gate.mjs';
import { openStore } from './store.mjs';
import { KEY, ME, article, comment, fakeDevto, noSleep } from './fixtures.mjs';

const NOW = new Date('2026-11-28T10:30:00Z');
const daysAgo = (d) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const post = (id, extra = {}) => ({ type_of: 'article', id, title: `Post ${id} about nextjs caching`, description: 'notes', url: `https://dev.to/u${id}/post-${id}`, tag_list: ['nextjs'], published_at: daysAgo(1), reading_time_minutes: 6, comments_count: 2, language: 'en', public_reactions_count: 5, user: { username: `u${id}`, name: `U ${id}` }, ...extra });
const CONFIG = { tags: ['nextjs'], queries: ['outbox'], ownTags: 2, maxAgeDays: 3, minReadingMinutes: 3, maxExistingComments: 25, languages: ['en', 'ar'], caps: { candidates: 8, comment: 3, reaction: 5, follow: 2 } };
const GOOD = 'The revalidateTag call runs before the transaction commits, so a reader can cache the old row again. Moving it after the commit closes that window.';
const harness = (fake) => {
  const dir = mkdtempSync(join(tmpdir(), 'devto-disc-'));
  return { dir, store: openStore(dir), client: createClient({ apiKey: KEY, fetch: fake.fetch, sleep: noSleep, minIntervalMs: 0 }), done: () => rmSync(dir, { recursive: true, force: true }) };
};
// A model that answers per article id with the given decision.
const model = (byId) => {
  const prompts = [];
  const run = async (p) => {
    prompts.push(p);
    const id = Number(p.match(/for article id (\d+)\.$/m)[1]);
    const d = typeof byId[id] === 'function' ? byId[id](prompts.length) : byId[id] || { action: 'skip', reason: 'nothing to add' };
    return { out: `DISCOVER_JSON: ${JSON.stringify({ id, ...d })}` };
  };
  run.prompts = prompts;
  return run;
};

test('the shipped config parses and has caps for every kind', () => {
  const c = loadConfig();
  for (const k of ['candidates', 'comment', 'reaction', 'follow']) assert.ok(Number.isInteger(c.caps[k]) && c.caps[k] > 0, k);
  assert.ok(c.tags.length && c.queries.length && c.maxAgeDays > 0);
});

test('ownTags ranks his most used tags', () => {
  assert.deepEqual(ownTags([article(1, { tag_list: ['nextjs', 'react'] }), article(2, { tag_list: ['nextjs', 'node'] }), article(3, { tag_list: ['node', 'nextjs'] })], 2), ['nextjs', 'node']);
});

test('findCandidates merges tag and search hits, filters, and ranks', async () => {
  const pool = [
    post(1),
    post(2, { title: 'The outbox pattern in nextjs', tag_list: ['nextjs', 'postgres'] }),
    post(3, { user: { username: ME } }),
    post(4, { published_at: daysAgo(5) }),
    post(5, { reading_time_minutes: 1 }),
    post(6, { comments_count: 80 }),
    post(7, { language: 'de' }),
    post(8, { title: 'Best casino bonus in nextjs' }),
    post(9),
    post(10),
  ];
  const fake = fakeDevto({ pool });
  const { candidates, stats } = await findCandidates({ client: harness(fake).client, username: ME, config: CONFIG, tags: ['nextjs', 'postgres'], seen: { 9: { outcome: 'skipped' } }, queuedArticles: new Set([10]), now: NOW.getTime() });
  assert.deepEqual(candidates.map((c) => c.article.id), [2, 1]);
  assert.match(candidates[0].why, /#nextjs, #postgres, "outbox"/);
  assert.equal(stats.unique, 10);
  assert.deepEqual(stats.dropped, { 'his own': 1, 'too old': 1, 'too short': 1, 'crowded thread': 1, 'other language': 1, 'looks like spam': 1, 'examined before': 1, 'already in the queue': 1 });
  assert.ok(fake.calls.some((c) => c.url.pathname === '/api/articles/search' && c.url.searchParams.get('q') === 'outbox' && c.url.searchParams.get('top') === '3'));
});

test('checkComment: no links, no self-promotion, no generic praise, enough substance, same language', () => {
  const art = { title: 'Caching in Next.js', body_markdown: 'Use revalidateTag after writes.' };
  assert.deepEqual(checkComment(GOOD, art), []);
  const p = (c) => checkComment(c, art).join('; ');
  assert.match(p(`${GOOD} More at https://x.dev/post`), /link/);
  assert.match(p(`${GOOD} I covered this on eng-ahmed.com too.`), /link/);
  assert.match(p(`${GOOD} We do this at Devya all the time.`), /self-promotion/);
  assert.match(p(`${GOOD} I wrote about this in my article last week.`), /self-promotion/);
  assert.match(p(`Great post! ${GOOD}`), /generic praise/);
  assert.match(p('Nice, agreed.'), /too short/);
  assert.match(p('هذا تعليق عربي طويل بما يكفي ليكون مفيدا ويتحدث عن التخزين المؤقت وإعادة التحقق بعد الكتابة في قاعدة البيانات'), /language/);
  assert.match(p(`${GOOD} #nextjs`), /hashtag/);
});

test('parseDecision accepts skip and a checked comment; refuses wrong ids and unknown reactions', () => {
  const art = { id: 7, title: 'Caching in Next.js', body_markdown: 'x' };
  assert.deepEqual(parseDecision('DISCOVER_JSON: {"id":7,"action":"skip","reason":"nothing new"}', art).ok, { action: 'skip', reason: 'nothing new' });
  const ok = parseDecision(`DISCOVER_JSON: ${JSON.stringify({ id: 7, action: 'comment', comment: GOOD, lang: 'en', reaction: 'like', follow: true, followReason: 'deep Next.js posts' })}`, art).ok;
  assert.deepEqual([ok.action, ok.reaction, ok.follow], ['comment', 'like', true]);
  assert.equal(parseDecision(`DISCOVER_JSON: ${JSON.stringify({ id: 7, action: 'comment', comment: GOOD, reaction: 'none' })}`, art).ok.reaction, null);
  assert.match(parseDecision(`DISCOVER_JSON: ${JSON.stringify({ id: 8, action: 'skip' })}`, art).problems[0], /not 7/);
  assert.match(parseDecision(`DISCOVER_JSON: ${JSON.stringify({ id: 7, action: 'comment', comment: GOOD, reaction: 'heart' })}`, art).problems.join(), /unknown reaction/);
  assert.match(parseDecision('nothing', art).problems[0], /no DISCOVER_JSON/);
});

function world() {
  const pool = [post(1), post(2), post(3), post(4)];
  const comments = { 1: [comment('x', 'first!')], 2: [], 3: [comment(ME, 'I already commented here', [], { id: 'm3' })], 4: [] };
  return fakeDevto({ articles: [article(100, { tag_list: ['nextjs'] })], pool, comments });
}

test('a run queues a comment with its reaction and follow, skips, rejects invalid drafts, never re-enters a thread', async () => {
  const h = harness(world());
  try {
    const m = model({ 1: { action: 'comment', comment: GOOD, lang: 'en', reaction: 'like', follow: true, followReason: 'writes deep Next.js posts' }, 2: { action: 'skip', reason: 'nothing to add' }, 4: { action: 'comment', comment: 'Great post! Thanks for sharing.' } });
    const { summary } = await runDiscovery({ client: h.client, store: h.store, username: ME, config: CONFIG, runModel: m, now: () => NOW });
    assert.deepEqual([summary.examined, summary.comments, summary.reactions, summary.follows, summary.skipped, summary.invalid, summary.alreadyInThread], [3, 1, 1, 1, 1, 1, 1]);
    assert.ok(!m.prompts.some((p) => p.includes('for article id 3.')), 'a thread he is already in costs no model call');
    assert.equal(m.prompts.filter((p) => p.includes('for article id 4.')).length, 2, 'an invalid draft is retried once');
    const q = h.store.loadQueue();
    assert.deepEqual(q.items.map((x) => [x.id, x.kind, x.status]), [['a1', 'comment', 'pending'], ['r1', 'reaction', 'pending'], ['u-u1', 'follow', 'pending']]);
    assert.equal(q.items[0].reply, GOOD);
    assert.equal(q.items[1].category, 'like');
    assert.equal(q.items[2].username, 'u1');
    assert.ok(q.items.every((x) => x.source === 'discovery'));
    const seen = h.store.loadState().discovered;
    assert.equal(seen[1].outcome, 'queued');
    assert.match(seen[2].outcome, /^skipped/);
    assert.match(seen[4].outcome, /^invalid: .*generic praise/);
    assert.equal(seen[3].outcome, 'already in thread');
    const again = model({});
    const r2 = await runDiscovery({ client: h.client, store: h.store, username: ME, config: CONFIG, runModel: again, now: () => NOW });
    assert.equal(again.prompts.length, 0);
    assert.equal(r2.summary.candidates, 0);
  } finally {
    h.done();
  }
});

test('daily caps hold within a day and reset the next day', async () => {
  const fake = fakeDevto({ articles: [article(100)], pool: [post(1), post(2), post(3)], comments: { 1: [], 2: [], 3: [] } });
  const h = harness(fake);
  try {
    const all = { action: 'comment', comment: GOOD, lang: 'en', reaction: 'like', follow: true };
    const cfg = { ...CONFIG, caps: { candidates: 8, comment: 1, reaction: 1, follow: 1 } };
    const r1 = await runDiscovery({ client: h.client, store: h.store, username: ME, config: cfg, runModel: model({ 1: all, 2: all, 3: all }), now: () => NOW });
    assert.deepEqual([r1.summary.comments, r1.summary.reactions, r1.summary.follows, r1.summary.capped], [1, 1, 1, 2]);
    const r2 = await runDiscovery({ client: h.client, store: h.store, username: ME, config: cfg, runModel: model({ 2: all }), now: () => new Date(NOW.getTime() + 3_600_000) });
    assert.equal(r2.summary.comments, 0, 'same Cairo day: cap already used');
    const r3 = await runDiscovery({ client: h.client, store: h.store, username: ME, config: cfg, runModel: model({ 2: all, 3: all }), now: () => new Date(NOW.getTime() + 86_400_000) });
    assert.equal(r3.summary.comments, 1, 'next day: room again');
    assert.deepEqual(queuedToday(h.store.loadQueue(), '2026-11-28'), { candidates: 0, comment: 1, reaction: 1, follow: 1 });
  } finally {
    h.done();
  }
});

test('one comment per author per day: a second post by the same author costs no model call', async () => {
  const fake = fakeDevto({ articles: [article(100)], pool: [post(1), post(2, { user: { username: 'u1' } }), post(3)], comments: { 1: [], 2: [], 3: [] } });
  const h = harness(fake);
  try {
    const all = { action: 'comment', comment: GOOD, lang: 'en', reaction: 'none' };
    const m = model({ 1: all, 2: all, 3: all });
    const { summary } = await runDiscovery({ client: h.client, store: h.store, username: ME, config: CONFIG, runModel: m, now: () => NOW });
    assert.deepEqual([summary.comments, summary.sameAuthor], [2, 1]);
    assert.equal(m.prompts.length, 2);
    assert.equal(h.store.loadState().discovered[2], undefined, 'not marked seen: it may be examined another day');
  } finally {
    h.done();
  }
});

test('dry run and --no-draft write nothing', async () => {
  const h = harness(world());
  try {
    const r = await runDiscovery({ client: h.client, store: h.store, username: ME, config: CONFIG, runModel: model({ 1: { action: 'comment', comment: GOOD } }), now: () => NOW, dryRun: true });
    assert.equal(r.added.length, 1);
    assert.ok(!existsSync(join(h.dir, 'queue.json')) && !existsSync(join(h.dir, 'state.json')));
    const l = await runDiscovery({ client: h.client, store: h.store, username: ME, config: CONFIG, runModel: null, now: () => NOW, noDraft: true });
    assert.deepEqual(l.listed.map((x) => x.id).sort(), [1, 2, 3, 4]);
    assert.ok(!existsSync(join(h.dir, 'state.json')));
  } finally {
    h.done();
  }
});

const disc = (id, kind, extra = {}) => ({ id, commentId: id, kind, source: 'discovery', articleId: 1, articleTitle: 'P', articleUrl: 'https://dev.to/u1/post-1', author: 'u1', status: 'pending', ...extra });

test('the gate covers reactions and follows: the approval binds the exact action', () => {
  const q = { items: [disc('r1', 'reaction', { category: 'like' }), disc('u-u1', 'follow', { username: 'u1' }), disc('a1', 'comment', { reply: GOOD })] };
  const decisions = [];
  approve(q, ['r1', 'u-u1', 'a1'], { addDecision: (r) => decisions.push(r), by: 't', at: '2026-11-28T10:00:00Z' });
  assert.equal(decisions[0].sha256, sha256('reaction like on article 1'));
  assert.equal(decisions[1].sha256, sha256('follow @u1'));
  assert.deepEqual(postPlan(q, decisions, []).ready.map((p) => p.id), ['r1', 'u-u1', 'a1']);
  q.items[0].category = 'unicorn';
  q.items[1].username = 'someone_else';
  assert.deepEqual(postPlan(q, decisions, []).blocked, [{ id: 'r1', reason: 'action changed after approval' }, { id: 'u-u1', reason: 'action changed after approval' }]);
  assert.match(edit(q, 'r1', 'text'), /no text to edit/);
  assert.equal(edit(q, 'a1', `${GOOD} Edited.`), null);
  assert.equal(q.items[2].kind, 'comment', 'an edited discovery comment stays a comment');
  assert.equal(payloadOf({ kind: 'flag' }), '');
});

test('postPlan enforces the daily caps against what was already posted today', () => {
  const q = { items: [disc('a1', 'comment', { reply: GOOD }), disc('a2', 'comment', { reply: `${GOOD} 2` }), disc('r1', 'reaction', { category: 'like' })] };
  const decisions = [];
  approve(q, ['a1', 'a2', 'r1'], { addDecision: (r) => decisions.push(r), by: 't' });
  const ledger = [{ kind: 'comment', commentId: 'old', at: '2026-11-28T08:00:00Z' }];
  const plan = postPlan(q, decisions, ledger, { caps: { comment: 2, reaction: 5 }, today: '2026-11-28' });
  assert.deepEqual(plan.ready.map((p) => p.id), ['a1', 'r1']);
  assert.match(plan.blocked[0].reason, /^daily cap reached \(2 comments per day\)/);
  assert.equal(postPlan(q, decisions, ledger, { caps: { comment: 2 }, today: '2026-11-29' }).ready.length, 3);
});

test('reactions post through the API only when approved; the writer refuses anything else', async () => {
  const writes = [];
  const fake = fakeDevto({ writes });
  const writer = createWriter({ apiKey: KEY, fetch: fake.fetch });
  const q = { items: [disc('r1', 'reaction', { category: 'like' }), disc('r2', 'reaction', { category: 'fire', articleId: 2 })] };
  const decisions = [];
  approve(q, ['r1'], { addDecision: (r) => decisions.push(r), by: 't' });
  const posted = [];
  const r = await postReactions({ plan: postPlan(q, decisions, []), queue: q, writer, addPosted: (x) => posted.push(x) });
  assert.deepEqual(writes, [{ category: 'like', id: 1, type: 'Article' }], 'the unapproved reaction is never sent');
  assert.deepEqual(r.posted.map((x) => x.id), ['r1']);
  assert.equal(posted[0].kind, 'reaction');
  assert.equal(q.items[0].status, 'posted');
  assert.equal(q.items[1].status, 'pending');
  await assert.rejects(writer.react({ category: 'heart', articleId: 1 }), /unknown reaction/);
  await assert.rejects(writer.react({ category: 'like', articleId: 'x' }), /bad article id/);
  const call = fake.calls.find((c) => c.init.method === 'POST');
  assert.equal(call.init.headers['api-key'], KEY);
});

test('comments are rechecked and verified on dev.to; follows are recorded as reported', async () => {
  const fake = fakeDevto({ comments: { 1: [comment('x', 'other'), comment(ME, GOOD, [], { id: 'mine1' })], 2: [comment(ME, 'an older comment of his', [], { id: 'mine2' })] } });
  const client = createClient({ apiKey: KEY, fetch: fake.fetch, sleep: noSleep, minIntervalMs: 0 });
  const q = { items: [disc('a1', 'comment', { reply: GOOD }), disc('a2', 'comment', { reply: GOOD, articleId: 2 }), disc('u-u1', 'follow', { username: 'u1' })] };
  const decisions = [];
  approve(q, ['a1', 'a2', 'u-u1'], { addDecision: (r) => decisions.push(r), by: 't' });
  const checked = await recheck(client, postPlan(q, decisions, []), ME);
  assert.deepEqual(checked.found.map((p) => p.id), ['a1']);
  assert.match(checked.stale[0].reason, /already commented on this article/);
  assert.deepEqual(checked.ready.map((p) => p.id), ['u-u1']);
  const posted = [];
  const r = await recordPosted({ queue: q, decisions, postedLedger: [], addPosted: (x) => posted.push(x), results: [{ id: 'a1', status: 'posted' }, { id: 'u-u1', status: 'posted' }], client, me: ME });
  assert.deepEqual(r.posted.map((x) => [x.id, x.url]), [['a1', `https://dev.to/${ME}/comment/mine1`], ['u-u1', 'https://dev.to/u1']]);
  assert.equal(posted[1].verified, false);
  assert.equal(posted[0].kind, 'comment');
});
