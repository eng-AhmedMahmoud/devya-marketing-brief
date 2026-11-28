// The approval gate. A reply can reach dev.to only through postPlan(), and
// postPlan() only lets through a queue item that
//   - is a reply draft (flags have no text and can never be approved),
//   - has status "approved",
//   - has, as its LATEST record in decisions.jsonl, an "approve" record whose
//     sha256 equals the sha256 of the exact reply text now in the queue
//     (editing the text after approval, or approving by editing queue.json,
//     blocks it), and
//   - is not in the posted ledger (never twice).
// The daily routine never builds a plan: posting is `run-devto-replies.sh post`,
// run by hand, and recordPosted() marks a reply posted only when the API shows
// it under the comment.

import { createHash } from 'node:crypto';
import { MAX_REPLY } from './drafts.mjs';
import { flattenTree, repliesUnder } from './threads.mjs';

export const sha256 = (s) => createHash('sha256').update(String(s), 'utf8').digest('hex');

const latest = (decisions, id) => {
  let last = null;
  for (const d of decisions) if (d && d.id === id) last = d;
  return last;
};

// Why `item` may not be posted, or null when it may.
export function gateReason(item, decisions, postedLedger) {
  if (!item) return 'not in the queue';
  if (item.kind !== 'reply' || !String(item.reply || '').trim()) return 'no reply draft (flagged comment)';
  if (item.status !== 'approved') return `status is ${item.status}, not approved`;
  if (postedLedger.some((p) => p.commentId === item.commentId)) return 'already posted';
  const d = latest(decisions, item.id);
  if (!d) return 'no approval record';
  if (d.decision !== 'approve') return `latest decision is ${d.decision}`;
  if (d.sha256 !== sha256(item.reply)) return 'reply text changed after approval';
  return null;
}

// Approves exact texts. Appends one decision record per id via addDecision.
export function approve(queue, ids, { addDecision, by, at = new Date().toISOString() }) {
  const done = [];
  const errors = [];
  for (const id of ids) {
    const it = queue.items.find((x) => x.id === id);
    if (!it) { errors.push(`${id}: not in the queue`); continue; }
    if (it.kind !== 'reply' || !String(it.reply || '').trim()) { errors.push(`${id}: flagged comment, nothing to approve`); continue; }
    if (it.status === 'posted') { errors.push(`${id}: already posted`); continue; }
    if (it.status === 'stale') { errors.push(`${id}: stale (${it.note || 'answered or deleted'})`); continue; }
    addDecision({ id, commentId: it.commentId, decision: 'approve', sha256: sha256(it.reply), chars: it.reply.length, at, by });
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
    addDecision({ id, commentId: it.commentId, decision: 'reject', at, by });
    it.status = it.kind === 'flag' ? 'dismissed' : 'rejected';
    it.updatedAt = at;
    done.push(id);
  }
  return { done, errors };
}

// Replaces a draft's text. It goes back to pending: the old approval no longer
// matches, so it must be approved again.
export function edit(queue, id, text, { at = new Date().toISOString() } = {}) {
  const it = queue.items.find((x) => x.id === id);
  if (!it) return `${id}: not in the queue`;
  if (it.status === 'posted') return `${id}: already posted`;
  const reply = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!reply) return `${id}: empty text`;
  if (reply.length > MAX_REPLY) return `${id}: too long (${reply.length} > ${MAX_REPLY})`;
  it.kind = 'reply';
  it.reply = reply;
  it.status = 'pending';
  it.edited = true;
  it.updatedAt = at;
  return null;
}

// The only source of what may be posted.
export function postPlan(queue, decisions, postedLedger) {
  const ready = [];
  const blocked = [];
  const commentIds = new Set();
  for (const it of queue.items) {
    if (it.status !== 'approved') continue;
    const why = gateReason(it, decisions, postedLedger) || (commentIds.has(it.commentId) ? 'duplicate comment id' : null);
    if (why) { blocked.push({ id: it.id, reason: why }); continue; }
    commentIds.add(it.commentId);
    ready.push({ id: it.id, commentId: it.commentId, articleId: it.articleId, articleTitle: it.articleTitle, commentUrl: it.commentUrl, author: it.author, reply: it.reply, sha256: sha256(it.reply) });
  }
  return { ready, blocked };
}

// Re-reads each planned comment's thread right before posting. Drops items
// whose comment is gone or that `me` has answered since; a reply already
// there with the approved text is reported as found (record it, don't repost).
export async function recheck(client, plan, me) {
  const ready = [];
  const stale = [];
  const found = [];
  const trees = new Map();
  for (const p of plan.ready) {
    if (!trees.has(p.articleId)) trees.set(p.articleId, flattenTree(await client.listComments(p.articleId), { articleId: p.articleId }));
    const flat = trees.get(p.articleId);
    const { node, mine, match } = repliesUnder(flat, p.commentId, me, p.reply);
    if (match) found.push({ ...p, url: `https://dev.to/${me}/comment/${match.id}` });
    else if (!node || node.deleted) stale.push({ ...p, reason: 'comment deleted' });
    else if (mine.length) stale.push({ ...p, reason: `already answered (${mine.map((m) => m.id).join(', ')})` });
    else ready.push(p);
  }
  return { ready, stale, found, blocked: plan.blocked };
}

// Records the browser session's results. Only ids the gate lets through right
// now count; "posted" is believed only when the API shows the approved text
// under the comment, written by `me`.
export async function recordPosted({ queue, decisions, postedLedger, addPosted, results, client, me, at = new Date().toISOString() }) {
  const plan = postPlan(queue, decisions, postedLedger);
  const byId = new Map(plan.ready.map((p) => [p.id, p]));
  const out = { posted: [], stale: [], unverified: [], failed: [], ignored: [] };
  const trees = new Map();
  for (const r of Array.isArray(results) ? results : []) {
    const p = byId.get(r?.id);
    if (!p) { out.ignored.push({ id: r?.id, reason: 'not an approved, unposted draft' }); continue; }
    const it = queue.items.find((x) => x.id === p.id);
    if (r.status === 'posted' || r.status === 'found') {
      if (!trees.has(p.articleId)) trees.set(p.articleId, flattenTree(await client.listComments(p.articleId), { articleId: p.articleId }));
      const { match } = repliesUnder(trees.get(p.articleId), p.commentId, me, p.reply);
      if (!match) { out.unverified.push({ id: p.id, reason: 'reply not found under the comment' }); it.note = 'posting reported but not found on dev.to; check by hand before posting again'; continue; }
      const url = `https://dev.to/${me}/comment/${match.id}`;
      addPosted({ id: p.id, commentId: p.commentId, sha256: p.sha256, url, at });
      postedLedger.push({ commentId: p.commentId });
      it.status = 'posted';
      it.postedUrl = url;
      it.updatedAt = at;
      out.posted.push({ id: p.id, url });
    } else if (r.status === 'stale') {
      it.status = 'stale';
      it.note = String(r.note || 'answered or deleted').slice(0, 200);
      it.updatedAt = at;
      out.stale.push({ id: p.id, reason: it.note });
    } else {
      it.note = String(r.note || r.status || 'failed').slice(0, 200);
      out.failed.push({ id: p.id, reason: it.note });
    }
  }
  return out;
}
