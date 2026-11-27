// A whole draft-mode run against a mocked dev.to and a mocked drafter:
// state, dedup, flags, the queue. node --test social/devto/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from './forem.mjs';
import { runScan, summaryLine } from './scan.mjs';
import { enqueue, markSeen, openStore } from './store.mjs';
import { KEY, ME, article, comment, fakeDevto, fakeModel, noSleep } from './fixtures.mjs';

function world() {
  const articles = [article(1, { comments_count: 5 }), article(2, { comments_count: 0 }), article(3, { comments_count: 2 })];
  const comments = {
    1: [
      comment('sara', 'How do you mock fetch here?', [comment(ME, 'With a fake fetch.', [], { id: 'mine1' })], { id: 'answered1' }),
      comment('omar', 'Does this work on Node 20?', [], { id: 'new1', at: '2026-11-21T00:00:00Z' }),
      comment('spammer', 'Best casino bonus https://x.example', [], { id: 'spam1', at: '2026-11-22T00:00:00Z' }),
      comment('gone', '[deleted]', [], { id: 'del1' }),
    ],
    2: [comment('x', 'never fetched: comments_count is 0', [], { id: 'skip2' })],
    3: [comment('lina', 'ممكن مثال على retries؟ جربت كذا مرة ومش شغال', [], { id: 'new3' })],
  };
  return fakeDevto({ articles, comments });
}

function harness() {
  const dir = mkdtempSync(join(tmpdir(), 'devto-scan-'));
  const fake = world();
  const client = createClient({ apiKey: KEY, fetch: fake.fetch, sleep: noSleep, minIntervalMs: 0 });
  const store = openStore(dir);
  const reply = (ids, prompt) => ({ drafts: ids.map((id) => (prompt.includes('"author": "lina"') ? { id, action: 'reply', lang: 'ar', reply: 'جرب `node --test` مع fake fetch بيرجع 429 مرتين' } : { id, action: 'reply', lang: 'en', reply: `Yes, \`node --test\` works there (${id}).` })) });
  return { dir, fake, client, store, reply, done: () => rmSync(dir, { recursive: true, force: true }) };
}

test('first run drafts new comments, flags spam without the model and skips own/answered/deleted', async () => {
  const h = harness();
  try {
    const model = fakeModel(h.reply);
    const { summary } = await runScan({ client: h.client, store: h.store, username: ME, runModel: model, now: () => new Date('2026-11-28T06:30:00Z') });
    assert.equal(summary.articles, 3);
    assert.equal(summary.scanned, 2, 'an article with comments_count 0 is not fetched');
    assert.ok(!h.fake.calls.some((c) => c.url.searchParams.get('a_id') === '2'));
    assert.deepEqual([summary.comments, summary.newComments, summary.drafted, summary.flagged, summary.own, summary.answered, summary.deleted, summary.failed], [6, 3, 2, 1, 1, 1, 1, 0]);
    assert.equal(model.prompts.length, 2, 'one drafting call per article with drafts to write');
    assert.ok(!model.prompts.join('\n').includes('casino'), 'the spam comment never reaches the model');

    const q = h.store.loadQueue();
    const by = Object.fromEntries(q.items.map((x) => [x.id, x]));
    assert.deepEqual(Object.keys(by).sort(), ['new1', 'new3', 'spam1']);
    assert.equal(by.new1.status, 'pending');
    assert.equal(by.new1.kind, 'reply');
    assert.equal(by.new1.commentUrl, 'https://dev.to/omar/comment/new1');
    assert.equal(by.new1.articleUrl, `https://dev.to/${ME}/article-1`);
    assert.equal(by.new3.lang, 'ar');
    assert.equal(by.spam1.kind, 'flag');
    assert.equal(by.spam1.status, 'flagged');
    assert.match(by.spam1.reason, /^spam: gambling/);
    assert.equal(by.spam1.reply, undefined);

    const seen = h.store.loadState().seen;
    assert.deepEqual(Object.fromEntries(Object.entries(seen).map(([k, v]) => [k, v.outcome])), { mine1: 'own', answered1: 'answered', del1: 'deleted', spam1: 'flagged', new1: 'drafted', new3: 'drafted' });
    assert.match(readFileSync(join(h.dir, 'queue.md'), 'utf8'), /2 pending/);
    assert.equal(h.store.runs().length, 1);
    assert.match(summaryLine(summary), /3 new → 2 drafted, 1 flagged/);
    assert.equal(statSync(join(h.dir, 'queue.json')).mode & 0o777, 0o600);
  } finally {
    h.done();
  }
});

test('second run finds nothing new: no model call, no duplicate queue items', async () => {
  const h = harness();
  try {
    await runScan({ client: h.client, store: h.store, username: ME, runModel: fakeModel(h.reply) });
    const again = fakeModel(h.reply);
    const { summary } = await runScan({ client: h.client, store: h.store, username: ME, runModel: again });
    assert.equal(again.prompts.length, 0);
    assert.equal(summary.newComments, 0);
    assert.equal(summary.seenBefore, 6);
    assert.equal(h.store.loadQueue().items.length, 3);
  } finally {
    h.done();
  }
});

test('a comment that fails drafting stays unseen and is retried; after 3 runs it is flagged', async () => {
  const h = harness();
  try {
    const failing = fakeModel((ids, prompt) => ({ drafts: ids.map((id) => (prompt.includes('"author": "lina"') ? { id, action: 'reply', reply: 'English only, wrong language.' } : { id, action: 'reply', reply: `Fine (${id}).` })) }));
    const r1 = await runScan({ client: h.client, store: h.store, username: ME, runModel: failing });
    assert.equal(r1.summary.failed, 1);
    assert.equal(h.store.loadState().seen.new3, undefined);
    assert.equal(h.store.loadState().failures.new3, 1);
    await runScan({ client: h.client, store: h.store, username: ME, runModel: failing });
    const r3 = await runScan({ client: h.client, store: h.store, username: ME, runModel: failing });
    assert.equal(r3.summary.flagged, 1);
    const it = h.store.loadQueue().items.find((x) => x.id === 'new3');
    assert.equal(it.kind, 'flag');
    assert.match(it.reason, /could not draft after 3 runs: not in the comment's language/);
    assert.equal(h.store.loadState().seen.new3.outcome, 'flagged');
  } finally {
    h.done();
  }
});

test('a usage limit stops drafting; the rest is deferred, unseen, for the next run', async () => {
  const h = harness();
  try {
    const capped = fakeModel(() => ({ limit: 'seat' }));
    const { summary } = await runScan({ client: h.client, store: h.store, username: ME, runModel: capped });
    assert.equal(summary.limit, 'seat');
    assert.equal(summary.drafted, 0);
    assert.equal(summary.deferred, 2);
    assert.equal(capped.prompts.length, 1, 'no further calls after the limit');
    const seen = h.store.loadState().seen;
    assert.equal(seen.new1, undefined);
    assert.equal(seen.new3, undefined);
    assert.equal(seen.spam1.outcome, 'flagged');
  } finally {
    h.done();
  }
});

test('--max caps drafts per run; the rest waits unseen', async () => {
  const h = harness();
  try {
    const { summary } = await runScan({ client: h.client, store: h.store, username: ME, runModel: fakeModel(h.reply), maxDrafts: 1 });
    assert.equal(summary.drafted, 1);
    assert.equal(summary.flagged, 1, 'flagging spam does not use the drafting budget');
    assert.equal(summary.deferred, 1);
    assert.equal(h.store.loadState().seen.new3, undefined);
  } finally {
    h.done();
  }
});

test('dry run drafts to dry/ and leaves queue and state untouched; --no-draft only lists', async () => {
  const h = harness();
  try {
    const { summary, added } = await runScan({ client: h.client, store: h.store, username: ME, runModel: fakeModel(h.reply), dryRun: true });
    assert.equal(added.length, 3);
    assert.ok(!existsSync(join(h.dir, 'queue.json')));
    assert.ok(!existsSync(join(h.dir, 'state.json')));
    assert.equal(readdirSync(join(h.dir, 'dry')).length, 2);
    assert.ok(summary.dryFile.endsWith('.md'));
    const model = fakeModel(h.reply);
    const list = await runScan({ client: h.client, store: h.store, username: ME, runModel: model, noDraft: true });
    assert.equal(model.prompts.length, 0);
    assert.deepEqual(list.listed.map((l) => l.id), ['new1', 'spam1', 'new3']);
    assert.ok(!existsSync(join(h.dir, 'state.json')));
  } finally {
    h.done();
  }
});

test('store: markSeen keeps the first outcome; enqueue is one item per comment', () => {
  const dir = mkdtempSync(join(tmpdir(), 'devto-store-'));
  try {
    const store = openStore(dir);
    const state = store.loadState();
    state.failures.x = 2;
    markSeen(state, [{ id: 'x', articleId: 1 }], 'drafted', 'T1');
    markSeen(state, [{ id: 'x', articleId: 1 }], 'own', 'T2');
    assert.deepEqual(state.seen.x, { article: 1, outcome: 'drafted', at: 'T1' });
    assert.equal(state.failures.x, undefined);
    store.saveState(state);
    assert.deepEqual(store.loadState().seen.x.outcome, 'drafted');
    const q = store.loadQueue();
    assert.equal(enqueue(q, { id: 'x', commentId: 'x' }), true);
    assert.equal(enqueue(q, { id: 'x2', commentId: 'x' }), false);
    store.addDecision({ id: 'x', decision: 'approve' });
    store.addDecision({ id: 'x', decision: 'reject' });
    assert.deepEqual(store.decisions().map((d) => d.decision), ['approve', 'reject']);
    assert.equal(statSync(join(dir, 'decisions.jsonl')).mode & 0o777, 0o600);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
