// The approval gate. Nothing reaches dev.to except through postPlan(), and
// postPlan() only lets through a queue item that
//   - is a postable kind: a reply under a comment on his articles, or, from
//     the discovery routine, a comment on someone else's article, a reaction
//     to an article or a follow (flags have nothing to post and can never be
//     approved),
//   - has status "approved",
//   - has, as its LATEST record in decisions.jsonl, an "approve" record whose
//     sha256 equals the sha256 of what would be posted now: the exact text, or
//     the exact action ("reaction like on article 123", "follow @name").
//     Editing after approval, or approving by editing queue.json, blocks it,
//   - is not in the posted ledger (never twice), and
//   - fits today's cap for its kind (discovery kinds; discovery.json caps).
// The scheduled runs never build a plan: posting is `run-devto-replies.sh
// post`, run by hand. recordPosted() marks a reply or comment posted only when
// the API shows it on dev.to.

import { createHash } from 'node:crypto';
import { MAX_REPLY } from './drafts.mjs';
import { flattenTree, repliesUnder, sameReply } from './threads.mjs';

export const sha256 = (s) => createHash('sha256').update(String(s), 'utf8').digest('hex');
export const TEXT_KINDS = new Set(['reply', 'comment']);
export const POSTABLE = new Set(['reply', 'comment', 'reaction', 'follow']);
const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

// What an approval approves.
export function payloadOf(it) {
  if (TEXT_KINDS.has(it?.kind)) return String(it.reply || '').trim() ? String(it.reply) : '';
  if (it?.kind === 'reaction') return it.category && it.articleId ? `reaction ${it.category} on article ${it.articleId}` : '';
  if (it?.kind === 'follow') return it.username ? `follow @${it.username}` : '';
  return '';
}

// The Cairo calendar day of an ISO time (caps are per Cairo day).
export function cairoDay(iso = new Date().toISOString()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

const latest = (decisions, id) => {
  let last = null;
  for (const d of decisions) if (d && d.id === id) last = d;
  return last;
};

// Why `item` may not be posted, or null when it may (caps aside).
export function gateReason(item, decisions, postedLedger) {
  if (!item) return 'not in the queue';
  if (!POSTABLE.has(item.kind)) return 'no reply draft (flagged comment)';
  const payload = payloadOf(item);
  if (!payload) return 'nothing to post';
  if (item.status !== 'approved') return `status is ${item.status}, not approved`;
  if (postedLedger.some((p) => p.commentId === item.commentId)) return 'already posted';
  const d = latest(decisions, item.id);
  if (!d) return 'no approval record';
  if (d.decision !== 'approve') return `latest decision is ${d.decision}`;
  if (d.sha256 !== sha256(payload)) return TEXT_KINDS.has(item.kind) ? 'reply text changed after approval' : 'action changed after approval';
  return null;
}

// Approves exact texts or actions. Appends one decision record per id.
export function approve(queue, ids, { addDecision, by, at = new Date().toISOString() }) {
  const done = [];
  const errors = [];
  for (const id of ids) {
    const it = queue.items.find((x) => x.id === id);
    if (!it) { errors.push(`${id}: not in the queue`); continue; }
    const payload = payloadOf(it);
    if (!POSTABLE.has(it.kind) || !payload) { errors.push(`${id}: flagged comment, nothing to approve`); continue; }
    if (it.status === 'posted') { errors.push(`${id}: already posted`); continue; }
    if (it.status === 'stale') { errors.push(`${id}: stale (${it.note || 'answered or deleted'})`); continue; }
    addDecision({ id, commentId: it.commentId, kind: it.kind, decision: 'approve', sha256: sha256(payload), chars: payload.length, at, by });
    it.status = 'approved';
    it.updatedAt = at;
    done.push(id);
  }
  return { done, errors };
}

export function reject(queue, ids, { addDecision, by, at = new Date().toISOString() }) {
  const done = [];
  const errors = [];
  for (const id of ids) {
    const it = queue.items.find((x) => x.id === id);
    if (!it) { errors.push(`${id}: not in the queue`); continue; }
    if (it.status === 'posted') { errors.push(`${id}: already posted`); continue; }
    addDecision({ id, commentId: it.commentId, kind: it.kind, decision: 'reject', at, by });
    it.status = it.kind === 'flag' ? 'dismissed' : 'rejected';
    it.updatedAt = at;
    done.push(id);
  }
  return { done, errors };
}

// Replaces a draft's text. It goes back to pending: the old approval no longer
// matches, so it must be approved again. Writing text under a flagged comment
// makes it a reply draft; a discovery comment stays a comment.
export function edit(queue, id, text, { at = new Date().toISOString() } = {}) {
  const it = queue.items.find((x) => x.id === id);
  if (!it) return `${id}: not in the queue`;
  if (it.status === 'posted') return `${id}: already posted`;
  if (it.kind === 'reaction' || it.kind === 'follow') return `${id}: a ${it.kind} suggestion has no text to edit (approve or reject it)`;
  const reply = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!reply) return `${id}: empty text`;
  if (reply.length > MAX_REPLY) return `${id}: too long (${reply.length} > ${MAX_REPLY})`;
  if (it.kind !== 'comment') it.kind = 'reply';
  if (it.original === undefined && it.reply) it.original = it.reply; // the drafter's text, for the feedback loop's diff
  it.reply = reply;
  it.status = 'pending';
  it.edited = true;
  it.updatedAt = at;
  return null;
}

// The only source of what may be posted. caps: {comment, reaction, follow}
// per Cairo day, counted with what the posted ledger already holds for today.
export function postPlan(queue, decisions, postedLedger, { caps = null, today = cairoDay() } = {}) {
  const ready = [];
  const blocked = [];
  const commentIds = new Set();
  const used = {};
  for (const p of postedLedger) if (p.kind && p.at && cairoDay(p.at) === today) used[p.kind] = (used[p.kind] || 0) + 1;
  for (const it of queue.items) {
    if (it.status !== 'approved') continue;
    let why = gateReason(it, decisions, postedLedger) || (commentIds.has(it.commentId) ? 'duplicate target' : null);
    const cap = caps?.[it.kind];
    if (!why && Number.isInteger(cap) && (used[it.kind] || 0) >= cap) why = `daily cap reached (${cap} ${it.kind}s per day); it stays approved for tomorrow`;
    if (why) { blocked.push({ id: it.id, reason: why }); continue; }
    commentIds.add(it.commentId);
    used[it.kind] = (used[it.kind] || 0) + 1;
    ready.push({
      id: it.id, kind: it.kind, commentId: it.commentId, articleId: it.articleId, articleTitle: it.articleTitle, articleUrl: it.articleUrl,
      commentUrl: it.commentUrl, author: it.author, username: it.username, category: it.category, reply: it.reply, sha256: sha256(payloadOf(it)),
    });
  }
  return { ready, blocked };
}

const mineOnArticle = (flat, me) => flat.filter((n) => same(n.author, me));

// Re-reads each planned reply's or comment's thread right before posting.
// Drops items whose comment is gone or that `me` has answered since; a reply
// or comment already there with the approved text is reported as found
// (record it, don't repost). Reactions and follows pass through.
export async function recheck(client, plan, me) {
  const ready = [];
  const stale = [];
  const found = [];
  const trees = new Map();
  const tree = async (id) => {
    if (!trees.has(id)) trees.set(id, flattenTree(await client.listComments(id), { articleId: id }));
    return trees.get(id);
  };
  for (const p of plan.ready) {
    if (p.kind === 'comment') {
      const flat = await tree(p.articleId);
      const mine = mineOnArticle(flat, me);
      const match = mine.find((n) => !n.parentId && sameReply(n.text, p.reply));
      if (match) found.push({ ...p, url: `https://dev.to/${me}/comment/${match.id}` });
      else if (mine.length) stale.push({ ...p, reason: `already commented on this article (${mine.map((m) => m.id).join(', ')})` });
      else ready.push(p);
    } else if (p.kind === 'reply' || !p.kind) {
      const { node, mine, match } = repliesUnder(await tree(p.articleId), p.commentId, me, p.reply);
      if (match) found.push({ ...p, url: `https://dev.to/${me}/comment/${match.id}` });
      else if (!node || node.deleted) stale.push({ ...p, reason: 'comment deleted' });
      else if (mine.length) stale.push({ ...p, reason: `already answered (${mine.map((m) => m.id).join(', ')})` });
      else ready.push(p);
    } else {
      ready.push(p);
    }
  }
  return { ready, stale, found, blocked: plan.blocked };
}

// Records the browser session's results. Only ids the gate lets through right
// now count. A reply or comment is believed only when the API shows the
// approved text on dev.to, written by `me`; a follow cannot be read back
// through the API, so it is recorded as reported (verified: false).
export async function recordPosted({ queue, decisions, postedLedger, addPosted, results, client, me, at = new Date().toISOString() }) {
  const plan = postPlan(queue, decisions, postedLedger);
  const byId = new Map(plan.ready.map((p) => [p.id, p]));
  const out = { posted: [], stale: [], unverified: [], failed: [], ignored: [] };
  const trees = new Map();
  const tree = async (id) => {
    if (!trees.has(id)) trees.set(id, flattenTree(await client.listComments(id), { articleId: id }));
    return trees.get(id);
  };
  const done = (p, it, url, extra = {}) => {
    addPosted({ id: p.id, kind: p.kind || 'reply', commentId: p.commentId, sha256: p.sha256, url, at, ...extra });
    postedLedger.push({ commentId: p.commentId });
    Object.assign(it, { status: 'posted', postedUrl: url, updatedAt: at });
    out.posted.push({ id: p.id, url });
  };
  for (const r of Array.isArray(results) ? results : []) {
    const p = byId.get(r?.id);
    if (!p || p.kind === 'reaction') { out.ignored.push({ id: r?.id, reason: p ? 'reactions are posted through the API, not the browser' : 'not an approved, unposted item' }); continue; }
    const it = queue.items.find((x) => x.id === p.id);
    if (r.status === 'posted' || r.status === 'found') {
      if (p.kind === 'follow') { done(p, it, `https://dev.to/${p.username}`, { verified: false }); continue; }
      const flat = await tree(p.articleId);
      const match = p.kind === 'comment'
        ? mineOnArticle(flat, me).find((n) => !n.parentId && sameReply(n.text, p.reply))
        : repliesUnder(flat, p.commentId, me, p.reply).match;
      if (!match) { out.unverified.push({ id: p.id, reason: `${p.kind || 'reply'} not found on dev.to` }); it.note = 'posting reported but not found on dev.to; check by hand before posting again'; continue; }
      done(p, it, `https://dev.to/${me}/comment/${match.id}`);
    } else if (r.status === 'stale') {
      Object.assign(it, { status: 'stale', note: String(r.note || 'answered or deleted').slice(0, 200), updatedAt: at });
      out.stale.push({ id: p.id, reason: it.note });
    } else {
      it.note = String(r.note || r.status || 'failed').slice(0, 200);
      out.failed.push({ id: p.id, reason: it.note });
    }
  }
  return out;
}

// Posts the approved reactions in a plan through the API (writer.react) and
// records each one. Only plan.ready items of kind "reaction" are touched.
export async function postReactions({ plan, queue, writer, addPosted, at = new Date().toISOString() }) {
  const out = { posted: [], failed: [] };
  for (const p of plan.ready.filter((x) => x.kind === 'reaction')) {
    const it = queue.items.find((x) => x.id === p.id);
    try {
      await writer.react({ category: p.category, articleId: p.articleId });
      addPosted({ id: p.id, kind: 'reaction', commentId: p.commentId, sha256: p.sha256, url: p.articleUrl, at });
      Object.assign(it, { status: 'posted', postedUrl: p.articleUrl, updatedAt: at });
      out.posted.push({ id: p.id, category: p.category, articleId: p.articleId });
    } catch (e) {
      it.note = String(e.message || e).slice(0, 200);
      out.failed.push({ id: p.id, reason: it.note });
      break; // stop at the first error
    }
  }
  return out;
}
