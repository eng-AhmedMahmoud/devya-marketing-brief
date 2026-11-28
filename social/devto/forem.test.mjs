// node --test social/devto/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACCEPT, ForemError, KEYCHAIN, createClient, keychainCommand, readKeychainKey } from './forem.mjs';
import { KEY, ME, article, comment, fakeDevto, noSleep } from './fixtures.mjs';

const client = (fake, over = {}) => createClient({ apiKey: KEY, fetch: fake.fetch, sleep: noSleep, minIntervalMs: 0, ...over });

test('articles are paged until a short page, with the username, api-key and Forem v1 accept header', async () => {
  const articles = Array.from({ length: 207 }, (_, i) => article(i + 1));
  const fake = fakeDevto({ articles });
  const got = await client(fake).listArticles(ME);
  assert.equal(got.length, 207);
  const pages = fake.calls.map((c) => [c.url.pathname, c.url.searchParams.get('page'), c.url.searchParams.get('per_page'), c.url.searchParams.get('username')]);
  assert.deepEqual(pages, [['/api/articles', '1', '100', ME], ['/api/articles', '2', '100', ME], ['/api/articles', '3', '100', ME]]);
  for (const c of fake.calls) {
    assert.equal(c.init.headers['api-key'], KEY);
    assert.equal(c.init.headers.accept, ACCEPT);
    assert.match(c.init.headers['user-agent'], /devya-devto-replies/);
    assert.equal(c.init.method, undefined, 'read-only: every request is a GET');
    assert.equal(c.init.body, undefined);
  }
});

test('an exact multiple of per_page costs one extra empty page, then stops', async () => {
  const fake = fakeDevto({ articles: Array.from({ length: 4 }, (_, i) => article(i + 1)) });
  const got = await client(fake, { perPage: 2 }).listArticles(ME);
  assert.equal(got.length, 4);
  assert.deepEqual(fake.calls.map((c) => c.url.searchParams.get('page')), ['1', '2', '3']);
});

test('duplicates across pages (a new article shifting the pages) are dropped', async () => {
  let call = 0;
  const fetch = async (url) => {
    call++;
    const rows = call === 1 ? [article(3), article(2)] : [article(2), article(1)].slice(0, call === 2 ? 2 : 0);
    return { ok: true, status: 200, headers: new Headers(), json: async () => (call > 2 ? [] : rows), url };
  };
  const got = await createClient({ apiKey: KEY, fetch, sleep: noSleep, minIntervalMs: 0, perPage: 2 }).listArticles(ME);
  assert.deepEqual(got.map((a) => a.id), [3, 2, 1]);
});

test('comment trees are paged by top-level comment with a_id and per_page', async () => {
  const tree = Array.from({ length: 3 }, (_, i) => comment(`u${i}`, `top ${i}`, [comment('x', 'nested')]));
  const fake = fakeDevto({ articles: [article(9)], comments: { 9: tree } });
  const got = await client(fake, { perPage: 2 }).listComments(9);
  assert.equal(got.length, 3);
  assert.equal(got[0].children.length, 1);
  assert.deepEqual(fake.calls.map((c) => [c.url.pathname, c.url.searchParams.get('a_id'), c.url.searchParams.get('page')]), [['/api/comments', '9', '1'], ['/api/comments', '9', '2']]);
});

test('429 waits for Retry-After and retries; 5xx retries; then it succeeds', async () => {
  const waits = [];
  const fake = fakeDevto({ articles: [article(1)], script: [{ match: /articles/, status: 429, headers: { 'retry-after': '7' }, times: 1 }, { match: /articles/, status: 502, times: 1 }] });
  const got = await client(fake, { sleep: async (ms) => waits.push(ms) }).listArticles(ME);
  assert.equal(got.length, 1);
  assert.deepEqual(waits, [7000, 4000]);
});

test('errors name the endpoint and status but never the key', async () => {
  const fake = fakeDevto({ key: 'another-key' });
  await assert.rejects(client(fake).me(), (e) => {
    assert.ok(e instanceof ForemError);
    assert.equal(e.status, 401);
    assert.match(e.message, /GET \/api\/users\/me: HTTP 401/);
    assert.ok(!e.message.includes(KEY));
    return true;
  });
  const down = fakeDevto({ script: [{ match: /comments/, status: 503, times: 9 }] });
  await assert.rejects(client(down, { maxTries: 2 }).listComments(1), /HTTP 503/);
});

test('a client without a key cannot be made', () => {
  assert.throws(() => createClient({ apiKey: '' }), /no dev.to API key/);
});

test('the key comes from the Keychain item (service, account); a missing item is null', () => {
  const calls = [];
  const run = (bin, args) => { calls.push([bin, ...args]); return { status: 0, stdout: `${KEY}\n` }; };
  assert.equal(readKeychainKey({ run }), KEY);
  assert.deepEqual(calls[0], ['/usr/bin/security', 'find-generic-password', '-s', KEYCHAIN.service, '-a', KEYCHAIN.account, '-w']);
  assert.equal(readKeychainKey({ run: () => ({ status: 44, stdout: '', stderr: 'could not be found' }) }), null);
  assert.equal(readKeychainKey({ run: () => ({ status: 0, stdout: '  \n' }) }), null);
  assert.equal(readKeychainKey({ run: () => ({ error: new Error('ENOENT') }) }), null);
});

test('the store command names the exact service and account and prompts for the key', () => {
  assert.equal(KEYCHAIN.service, 'devto-api-key');
  assert.equal(KEYCHAIN.account, 'ahmed_mahmoud360');
  assert.equal(keychainCommand(), 'security add-generic-password -U -s devto-api-key -a ahmed_mahmoud360 -w');
});
