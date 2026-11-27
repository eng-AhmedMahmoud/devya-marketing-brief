// The approval gate: nothing reaches dev.to without an explicit approval
// record for the exact text. node --test social/devto/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from './forem.mjs';
import { approve, edit, gateReason, postPlan, recheck, recordPosted, reject, sha256 } from './gate.mjs';
import { KEY, ME, article, comment, fakeDevto, noSleep } from './fixtures.mjs';

const draft = (id, extra = {}) => ({ id, commentId: id, articleId: 5, articleTitle: 'A', commentUrl: `https://dev.to/sam/comment/${id}`, author: 'sam', kind: 'reply', reply: `Reply for ${id}.`, status: 'pending', ...extra });
const flagItem = (id) => ({ id, commentId: id, articleId: 5, kind: 'flag', reason: 'spam: links', status: 'flagged' });

function setup(items) {
  const queue = { version: 1, items };
  const decisions = [];
  const posted = [];
  return { queue, decisions, posted, addDecision: (r) => decisions.push(r), addPosted: (r) => posted.push(r) };
}

test('a fresh queue plans nothing: pending drafts are never posted', () => {
  const s = setup([draft('a'), draft('b'), flagItem('c')]);
  assert.deepEqual(postPlan(s.queue, s.decisions, s.posted), { ready: [], blocked: [] });
});

test('approve writes a record with the sha256 of the exact text, and only then is it planned', () => {
  const s = setup([draft('a'), draft('b')]);
  const r = approve(s.queue, ['a'], { addDecision: s.addDecision, by: 'tester', at: '2026-11-28T08:00:00Z' });
  assert.deepEqual(r, { done: ['a'], errors: [] });
  assert.deepEqual(s.decisions[0], { id: 'a', commentId: 'a', decision: 'approve', sha256: sha256('Reply for a.'), chars: 12, at: '2026-11-28T08:00:00Z', by: 'tester' });
  const plan = postPlan(s.queue, s.decisions, s.posted);
  assert.deepEqual(plan.ready.map((p) => [p.id, p.reply, p.sha256]), [['a', 'Reply for a.', sha256('Reply for a.')]]);
  assert.deepEqual(plan.blocked, []);
});

test('status "approved" written into queue.json without an approval record is blocked', () => {
  const s = setup([draft('a', { status: 'approved' })]);
  const plan = postPlan(s.queue, s.decisions, s.posted);
  assert.deepEqual(plan.ready, []);
  assert.deepEqual(plan.blocked, [{ id: 'a', reason: 'no approval record' }]);
});

test('text changed after approval (by hand in queue.json) is blocked', () => {
  const s = setup([draft('a')]);
  approve(s.queue, ['a'], { addDecision: s.addDecision, by: 't' });
  s.queue.items[0].reply = 'Reply for a. Plus a link https://spam.example';
  assert.deepEqual(postPlan(s.queue, s.decisions, s.posted).blocked, [{ id: 'a', reason: 'reply text changed after approval' }]);
});

test('an approval record for another id or another text does not count', () => {
  const s = setup([draft('a', { status: 'approved' })]);
  s.decisions.push({ id: 'b', decision: 'approve', sha256: sha256('Reply for a.') });
  assert.equal(gateReason(s.queue.items[0], s.decisions, s.posted), 'no approval record');
  s.decisions.push({ id: 'a', decision: 'approve', sha256: sha256('other text') });
  assert.equal(gateReason(s.queue.items[0], s.decisions, s.posted), 'reply text changed after approval');
});

test('reject after approve wins (latest decision), even if status is forced back to approved', () => {
  const s = setup([draft('a')]);
  approve(s.queue, ['a'], { addDecision: s.addDecision, by: 't' });
  reject(s.queue, ['a'], { addDecision: s.addDecision, by: 't' });
  assert.equal(s.queue.items[0].status, 'rejected');
  s.queue.items[0].status = 'approved';
  assert.deepEqual(postPlan(s.queue, s.decisions, s.posted).blocked, [{ id: 'a', reason: 'latest decision is reject' }]);
});

test('edit sends a draft back to pending; it needs a new approval for its new text', () => {
  const s = setup([draft('a')]);
  approve(s.queue, ['a'], { addDecision: s.addDecision, by: 't' });
  assert.equal(edit(s.queue, 'a', '  Better reply.  '), null);
  assert.equal(s.queue.items[0].status, 'pending');
  assert.equal(s.queue.items[0].reply, 'Better reply.');
  assert.deepEqual(postPlan(s.queue, s.decisions, s.posted).ready, []);
  approve(s.queue, ['a'], { addDecision: s.addDecision, by: 't' });
  assert.deepEqual(postPlan(s.queue, s.decisions, s.posted).ready.map((p) => p.reply), ['Better reply.']);
  assert.match(edit(s.queue, 'a', ''), /empty text/);
  assert.match(edit(s.queue, 'a', 'x'.repeat(1300)), /too long/);
  assert.match(edit(s.queue, 'nope', 'x'), /not in the queue/);
});

test('flagged comments, posted, stale and unknown ids cannot be approved', () => {
  const s = setup([flagItem('f'), draft('p', { status: 'posted' }), draft('s', { status: 'stale', note: 'deleted' })]);
  const r = approve(s.queue, ['f', 'p', 's', 'zz'], { addDecision: s.addDecision, by: 't' });
  assert.deepEqual(r.done, []);
  assert.equal(r.errors.length, 4);
  assert.equal(s.decisions.length, 0);
  s.queue.items[0].status = 'approved';
  assert.deepEqual(postPlan(s.queue, s.decisions, s.posted).blocked, [{ id: 'f', reason: 'no reply draft (flagged comment)' }]);
});

test('a reply in the posted ledger is never planned again', () => {
  const s = setup([draft('a')]);
  approve(s.queue, ['a'], { addDecision: s.addDecision, by: 't' });
  s.posted.push({ id: 'a', commentId: 'a', url: 'https://dev.to/x/comment/z' });
  assert.deepEqual(postPlan(s.queue, s.decisions, s.posted).blocked, [{ id: 'a', reason: 'already posted' }]);
});

test('reject dismisses a flag and leaves a decision record', () => {
  const s = setup([flagItem('f')]);
  assert.deepEqual(reject(s.queue, ['f'], { addDecision: s.addDecision, by: 't' }).done, ['f']);
  assert.equal(s.queue.items[0].status, 'dismissed');
  assert.equal(s.decisions[0].decision, 'reject');
});

function devtoWith(tree) {
  const fake = fakeDevto({ articles: [article(5)], comments: { 5: tree } });
  return { fake, client: createClient({ apiKey: KEY, fetch: fake.fetch, sleep: noSleep, minIntervalMs: 0 }) };
}

test('recheck drops deleted or since-answered comments and finds replies already there', async () => {
  const s = setup([draft('a'), draft('b'), draft('c'), draft('d')]);
  approve(s.queue, ['a', 'b', 'c', 'd'], { addDecision: s.addDecision, by: 't' });
  const { client } = devtoWith([
    comment('sam', 'q a', [], { id: 'a' }),
    comment('sam', 'q b', [comment(ME, 'I answered this by hand.')], { id: 'b' }),
    comment('sam', 'q c', [comment(ME, 'Reply for c.')], { id: 'c' }),
    comment('sam', '[deleted]', [], { id: 'd' }),
  ]);
  const r = await recheck(client, postPlan(s.queue, s.decisions, s.posted), ME);
  assert.deepEqual(r.ready.map((p) => p.id), ['a']);
  assert.deepEqual(r.stale.map((p) => [p.id, p.reason.split(' (')[0]]), [['b', 'already answered'], ['d', 'comment deleted']]);
  assert.deepEqual(r.found.map((p) => p.id), ['c']);
});

test('recordPosted believes "posted" only when dev.to shows the approved text under the comment', async () => {
  const s = setup([draft('a'), draft('b'), draft('n')]);
  approve(s.queue, ['a', 'b'], { addDecision: s.addDecision, by: 't' });
  const { client } = devtoWith([
    comment('sam', 'q a', [comment(ME, 'Reply for a.', [], { id: 'r1' })], { id: 'a' }),
    comment('sam', 'q b', [], { id: 'b' }),
    comment('sam', 'q n', [], { id: 'n' }),
  ]);
  const results = [{ id: 'a', status: 'posted' }, { id: 'b', status: 'posted' }, { id: 'n', status: 'posted' }, { id: 'zz', status: 'posted' }];
  const r = await recordPosted({ queue: s.queue, decisions: s.decisions, postedLedger: [...s.posted], addPosted: s.addPosted, results, client, me: ME, at: 'T' });
  assert.deepEqual(r.posted, [{ id: 'a', url: `https://dev.to/${ME}/comment/r1` }]);
  assert.deepEqual(r.unverified.map((x) => x.id), ['b']);
  assert.deepEqual(r.ignored.map((x) => x.id), ['n', 'zz'], 'unapproved and unknown ids are never recorded');
  assert.equal(s.posted.length, 1);
  assert.equal(s.posted[0].sha256, sha256('Reply for a.'));
  assert.equal(s.queue.items[0].status, 'posted');
  assert.equal(s.queue.items[1].status, 'approved');
  assert.equal(s.queue.items[2].status, 'pending');
  assert.deepEqual(postPlan(s.queue, s.decisions, s.posted).ready.map((p) => p.id), ['b']);
});
