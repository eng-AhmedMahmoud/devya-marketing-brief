// node --test social/routine/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { browserVerdict, deviceHolder, limitBanner, withRetry, NEEDS_YOU } from './preflight.mjs';

const PROFILE = 'Chrome "Profile 2" (Devya)';
const check = (over = {}) => [{ seat: 'ceo', email: 'ceo@devya.dev', ok: false, configured: true, profile: PROFILE, device: null, logins: [], problems: [], ...over }];
const notConnected = { kind: 'not-connected', key: 'connect', needsYou: true, text: 'ceo: no browser of ceo@devya.dev is connected; open Chrome "Profile 2" (Devya) and sign its Claude extension in as ceo@devya.dev' };

test('connected device with no problems is ok and carries the device id', () => {
  const v = browserVerdict(check({ ok: true, device: { id: '74f71889-1e40-4059-8019-476bf8e39d7b', name: 'Browser 1' } }), { seat: 'ceo' });
  assert.equal(v.ok, true);
  assert.equal(v.unknown, false);
  assert.equal(v.deviceId, '74f71889-1e40-4059-8019-476bf8e39d7b');
  assert.match(v.line, /^browser preflight: ok .*ceo@devya\.dev .*74f71889/);
});

test('no browser connected is a NEEDS-YOU line, not ok', () => {
  const v = browserVerdict(check({ problems: [notConnected] }), { seat: 'ceo' });
  assert.equal(v.ok, false);
  assert.equal(v.unknown, false);
  assert.equal(v.deviceId, null);
  assert.match(v.line, /^NEEDS-YOU: no browser of ceo@devya\.dev is connected; open Chrome "Profile 2"/);
  assert.match(v.line, /Nothing was posted; the next slot retries\.$/);
  assert.equal(v.line.split('\n').length, 1);
});

test('extension signed in to another account names that account and the fix', () => {
  const v = browserVerdict(check({ problems: [notConnected] }), { seat: 'ceo', holder: 'cto@devya.dev' });
  assert.match(v.line, /^NEEDS-YOU: the Claude extension in Chrome "Profile 2" \(Devya\) is signed in as cto@devya\.dev, not ceo@devya\.dev\./);
  assert.match(v.line, /log out, and log in as ceo@devya\.dev/);
});

test('holder equal to the seat itself falls back to brain\'s text', () => {
  const v = browserVerdict(check({ problems: [notConnected] }), { seat: 'ceo', holder: 'CEO@devya.dev' });
  assert.match(v.line, /^NEEDS-YOU: no browser of ceo@devya\.dev/);
});

test('Chrome not running says so first', () => {
  const v = browserVerdict(check({ problems: [notConnected] }), { seat: 'ceo', holder: 'cto@devya.dev', chromeRunning: false });
  assert.match(v.line, /^NEEDS-YOU: Chrome is not running\. Open Chrome "Profile 2" \(Devya\)/);
});

test('a listed device that does not answer still blocks', () => {
  const v = browserVerdict(check({ device: { id: 'abc', name: 'Browser 1' }, problems: [{ kind: 'not-connected', key: 'connect', needsYou: true, text: 'ceo: Chrome "Profile 2" (Devya) is listed but does not answer: timed out' }] }), { seat: 'ceo' });
  assert.equal(v.ok, false);
  assert.match(v.line, /^NEEDS-YOU: Chrome "Profile 2" \(Devya\) is listed but does not answer/);
});

test('paired with another device is not blocking: the launcher passes the device id', () => {
  const v = browserVerdict(check({ device: { id: 'dev-2', name: 'Browser 2' }, problems: [{ kind: 'not-connected', key: 'pair', needsYou: true, text: 'ceo is paired with another browser' }] }), { seat: 'ceo' });
  assert.equal(v.ok, true);
  assert.equal(v.deviceId, 'dev-2');
});

test('claude.ai signed out in the profile blocks; another service\'s login does not', () => {
  const out = browserVerdict(check({ problems: [{ kind: 'login-expired', key: 'login:claude', needsYou: true, text: 'ceo: claude.ai is signed out in Chrome "Profile 2" (Devya); sign in there as ceo@devya.dev once, then in the Claude extension' }] }), { seat: 'ceo' });
  assert.equal(out.ok, false);
  assert.match(out.line, /^NEEDS-YOU: claude\.ai is signed out/);
  const cf = browserVerdict(check({ device: { id: 'd' }, problems: [{ kind: 'login-expired', key: 'login:cloudflare', needsYou: true, text: 'Cloudflare signed out' }] }), { seat: 'ceo' });
  assert.equal(cf.ok, true);
});

test('missing or broken brain output fails open (unknown), never NEEDS-YOU', () => {
  for (const input of [null, undefined, {}, [], [{ seat: 'support' }]]) {
    const v = browserVerdict(input, { seat: 'ceo' });
    assert.equal(v.ok, false);
    assert.equal(v.unknown, true);
    assert.match(v.line, /^WARN: /);
  }
  const err = browserVerdict(check({ problems: [{ kind: 'error', key: 'error', needsYou: false, text: 'ceo: bridge 502' }] }), { seat: 'ceo' });
  assert.equal(err.unknown, true);
  assert.match(err.line, /bridge 502/);
});

test('deviceHolder finds which account\'s device the extension storage holds', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cic-'));
  try {
    const accounts = [
      { email: 'ceo@devya.dev', deviceId: '74f71889-1e40-4059-8019-476bf8e39d7b' },
      { email: 'cto@devya.dev', deviceId: '60229e97-112f-4817-95ed-8f992f5a3d39' },
      { email: 'nodevice@devya.dev' },
    ];
    assert.equal(deviceHolder(dir, accounts, 'ceo@devya.dev'), null);
    writeFileSync(join(dir, '000004.log'), Buffer.from('\x00junk device_AC 60229e97-112f-4817-95ed-8f992f5a3d39 more\x01'));
    writeFileSync(join(dir, 'MANIFEST-000001'), '74f71889-1e40-4059-8019-476bf8e39d7b'); // not a .log/.ldb file: ignored
    assert.equal(deviceHolder(dir, accounts, 'ceo@devya.dev'), 'cto@devya.dev');
    writeFileSync(join(dir, '000005.ldb'), '74f71889-1e40-4059-8019-476bf8e39d7b');
    assert.equal(deviceHolder(dir, accounts, 'ceo@devya.dev'), 'ceo@devya.dev');
    assert.equal(deviceHolder(join(dir, 'missing'), accounts, 'ceo@devya.dev'), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('limitBanner tells a model cap from a seat cap', () => {
  assert.deepEqual(limitBanner('x\nYou\'ve hit your Fable limit · resets Nov 26 at 7pm (Africa/Cairo). Switch to another model to continue.\n'),
    { limit: 'model', banner: 'You\'ve hit your Fable limit · resets Nov 26 at 7pm (Africa/Cairo). Switch to another model to continue.' });
  assert.equal(limitBanner('You\'ve hit your Opus limit · resets 3pm').limit, 'model');
  assert.equal(limitBanner('You\'ve hit your weekly limit · resets Nov 19 at 7pm (Africa/Cairo)').limit, 'seat');
  assert.equal(limitBanner('You\'ve hit your 5-hour limit · resets 10:10pm (Africa/Cairo)').limit, 'seat');
  assert.equal(limitBanner('Claude usage limit reached|1795489963').limit, 'seat');
  assert.deepEqual(limitBanner('ERROR: no Chrome browser connected\nRESULT_JSON: {}'), { limit: null });
  assert.deepEqual(limitBanner('the post talks about rate limits and usage limits'), { limit: null });
  assert.deepEqual(limitBanner(''), { limit: null });
});

test('withRetry retries a not-connected check once, then stops', async () => {
  const waits = [];
  const sleep = async (ms) => { waits.push(ms); };
  const seq = [{ ok: false, unknown: false, line: 'NEEDS-YOU: a' }, { ok: true, unknown: false, line: 'ok' }];
  let n = 0;
  const v = await withRetry(async () => seq[n++], { tries: 2, waitMs: 5, sleep });
  assert.equal(v.ok, true);
  assert.equal(n, 2);
  assert.deepEqual(waits, [5]);

  n = 0;
  const bad = await withRetry(async () => { n++; return { ok: false, unknown: false, line: 'NEEDS-YOU: b' }; }, { tries: 2, waitMs: 5, sleep });
  assert.equal(bad.ok, false);
  assert.equal(n, 2);

  n = 0;
  const unk = await withRetry(async () => { n++; return { ok: false, unknown: true, line: 'WARN' }; }, { tries: 3, waitMs: 5, sleep });
  assert.equal(unk.unknown, true);
  assert.equal(n, 1);
});

test('NEEDS_YOU exit code is 3, as run-daily-social.sh expects', () => {
  assert.equal(NEEDS_YOU, 3);
});
