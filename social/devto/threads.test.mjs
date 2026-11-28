// node --test social/devto/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, commentUrl, flattenTree, htmlToText, repliesUnder, sameReply, threadOf } from './threads.mjs';
import { ME, comment } from './fixtures.mjs';

test('htmlToText keeps paragraphs, code blocks, links and entities readable', () => {
  const html = '<p>Hi &amp; thanks!<br>Line two</p><div class="highlight"><pre class="highlight js"><code><span>const</span> a = 1 &lt; 2;</code></pre></div><p>See <a href="https://nodejs.org/api/test.html">the docs</a>, <a href="https://dev.to/sam">@sam</a> and <a href="https://x.dev">https://x.dev</a> &#x1F64F;</p>';
  assert.equal(htmlToText(html), 'Hi & thanks!\nLine two\n\n```\nconst a = 1 < 2;\n```\n\nSee the docs (https://nodejs.org/api/test.html), @sam and https://x.dev 🙏');
});

function sample() {
  // a (visitor) ─ b (ME) ─ c (visitor again: a new comment in an answered thread)
  // d (visitor) ─ e (visitor)
  // f (ME)
  // g ([deleted])
  // h (visitor, account gone)
  return [
    comment('sara', 'How do you mock fetch?', [comment(ME, 'With a fake fetch.', [comment('sara', 'And retries?', [], { id: 'c', at: '2026-11-20T00:00:00Z' })], { id: 'b' })], { id: 'a', at: '2026-11-01T00:00:00Z' }),
    comment('omar', 'Nice post', [comment('lina', 'Agreed, one question though', [], { id: 'e', at: '2026-11-05T00:00:00Z' })], { id: 'd', at: '2026-11-04T00:00:00Z' }),
    comment(ME, 'Update: v2 is out', [], { id: 'f' }),
    comment('ghost', '[deleted]', [], { id: 'g' }),
    comment(null, 'orphan', [], { id: 'h' }),
  ];
}

test('flattenTree walks every depth with parent, root and ancestor ids', () => {
  const flat = flattenTree(sample(), { articleId: 7 });
  assert.deepEqual(flat.map((n) => n.id), ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
  const c = flat.find((n) => n.id === 'c');
  assert.equal(c.parentId, 'b');
  assert.equal(c.rootId, 'a');
  assert.deepEqual(c.ancestors, ['a', 'b']);
  assert.equal(c.depth, 2);
  assert.equal(c.articleId, 7);
  assert.deepEqual(flat.find((n) => n.id === 'a').childIds, ['b']);
  assert.equal(flat.find((n) => n.id === 'g').deleted, true);
  assert.equal(flat.find((n) => n.id === 'h').deleted, true);
  assert.equal(commentUrl(flat[0]), 'https://dev.to/sara/comment/a');
});

test('flattenTree survives junk nodes and missing children', () => {
  const flat = flattenTree([null, { id_code: '' }, { id_code: 'x', body_html: '<p>ok</p>', user: { username: 'u' } }]);
  assert.deepEqual(flat.map((n) => n.id), ['x']);
  assert.deepEqual(flattenTree(undefined), []);
});

test('classify skips his own comments, answered threads and deleted ones; drafts the rest oldest first', () => {
  const flat = flattenTree(sample(), { articleId: 7 });
  const c = classify(flat, { me: 'Ahmed_Mahmoud360' });
  assert.deepEqual(c.own.map((n) => n.id), ['b', 'f']);
  assert.deepEqual(c.answered.map((n) => n.id), ['a']);
  assert.deepEqual(c.deleted.map((n) => n.id), ['g', 'h']);
  assert.deepEqual(c.toDraft.map((n) => n.id), ['d', 'e', 'c']);
});

test('seen comments are never drafted again', () => {
  const flat = flattenTree(sample());
  const c = classify(flat, { me: ME, seen: { d: { outcome: 'drafted' }, c: { outcome: 'drafted' } } });
  assert.deepEqual(c.toDraft.map((n) => n.id), ['e']);
  assert.deepEqual(c.seen.map((n) => n.id), ['c', 'd']);
});

test('a visitor reply under his reply is not "answered" by the reply above it', () => {
  const flat = flattenTree(sample());
  assert.ok(classify(flat, { me: ME }).toDraft.some((n) => n.id === 'c'));
});

test('threadOf gives the comments above, oldest first', () => {
  const flat = flattenTree(sample());
  const t = threadOf(flat.find((n) => n.id === 'c'), flat);
  assert.deepEqual(t.map((x) => [x.id, x.author]), [['a', 'sara'], ['b', ME]]);
  assert.equal(t[0].text, 'How do you mock fetch?');
});

test('sameReply matches a Markdown draft with its rendered comment', () => {
  const reply = 'Use `node --test` and a **fake** fetch:\n\n```js\nconst f = async () => ({ ok: true });\n```';
  const rendered = htmlToText('<p>Use <code>node --test</code> and a <strong>fake</strong> fetch:</p><pre><code>const f = async () =&gt; ({ ok: true });</code></pre>');
  assert.equal(sameReply(rendered, reply), true);
  assert.equal(sameReply('Something else entirely', reply), false);
  assert.equal(sameReply('anything', ''), false);
});

test('repliesUnder finds his replies and the one carrying the approved text', () => {
  const flat = flattenTree(sample());
  const r = repliesUnder(flat, 'a', ME, 'With a fake fetch.');
  assert.equal(r.node.id, 'a');
  assert.deepEqual(r.mine.map((n) => n.id), ['b']);
  assert.equal(r.match.id, 'b');
  assert.equal(repliesUnder(flat, 'd', ME, 'x').mine.length, 0);
  assert.equal(repliesUnder(flat, 'zz', ME).node, null);
});
