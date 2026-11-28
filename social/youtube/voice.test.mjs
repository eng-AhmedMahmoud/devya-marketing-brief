// The cloned-voice client (mocked HTTP: no credits spent) and the narration
// checks (word skeletons; pitch and brightness on synthetic sound).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { applyLexicon, mapBack, quotaPlan, synthesize, subscription, apiKey, takeKey, QuotaExceeded, SETTINGS, MODEL, RESERVE } from './voice.mjs';
import { skeleton, near, wordScore, pcm16k, voiceProfile, registerOutliers, heavyStretches } from './voicecheck.mjs';

const json = (body, { status = 200, headers = {} } = {}) => ({ ok: status < 400, status, headers: { get: (k) => headers[k] ?? null }, json: async () => body, text: async () => JSON.stringify(body) });

test('the lexicon respells whole words only, and timings map back onto the script', () => {
  const lex = { 'CLAUDE.md': 'Claude dot md', env: 'dot env', '443': 'four forty-three' };
  const text = 'ملف CLAUDE.md مش environment ولا env، على 443.';
  const { sent, spans } = applyLexicon(text, lex);
  assert.equal(sent, 'ملف Claude dot md مش environment ولا dot env، على four forty-three.');
  assert.equal(spans.length, 3);
  const starts = [...sent].map((_, i) => i / 10), ends = [...sent].map((_, i) => (i + 1) / 10);
  const m = mapBack(text, spans, starts, ends);
  assert.equal(m.starts.length, text.length);
  const k = text.indexOf('CLAUDE.md');
  assert.equal(m.starts[k], starts[sent.indexOf('Claude dot md')]);
  assert.equal(m.starts[text.indexOf('مش')], starts[sent.indexOf('مش')]);
  for (let i = 1; i < m.starts.length; i++) assert.ok(m.starts[i] >= m.starts[i - 1]);
});

test('a take is kept until its spelling, voice or model changes', () => {
  assert.equal(takeKey('a', 'v', MODEL), takeKey('a', 'v', MODEL));
  assert.notEqual(takeKey('a', 'v', MODEL), takeKey('b', 'v', MODEL));
  assert.notEqual(takeKey('a', 'v', MODEL), takeKey('a', 'w', MODEL));
});

test('the quota guard keeps a reserve and refuses what would need paying for', () => {
  const sub = { used: 120000, limit: 131000, resets: '2026-12-21' };
  assert.equal(quotaPlan(sub, 5000).ok, true);
  assert.equal(quotaPlan(sub, 6001).ok, false);
  assert.equal(quotaPlan(sub, 6001).reserve, RESERVE);
  const e = new QuotaExceeded(quotaPlan(sub, 9000));
  assert.match(e.message, /^QUOTA: .*Nothing was sent/);
});

test('subscription and key: env first; the key is sent only as a header', async () => {
  assert.equal(apiKey({ ELEVENLABS_API_KEY: 'k-test' }), 'k-test');
  let seen;
  const s = await subscription('k-test', async (url, init) => { seen = { url, init }; return json({ character_count: 10, character_limit: 100, tier: 'creator', next_character_count_reset_unix: 1797865634 }); });
  assert.deepEqual([s.used, s.limit, s.tier], [10, 100, 'creator']);
  assert.equal(seen.init.headers['xi-api-key'], 'k-test');
  assert.ok(!seen.url.includes('k-test'));
});

test('a take is requested with the approved voice settings, context and timestamps', async () => {
  let req;
  const text = 'تمام كده';
  const fetchImpl = async (url, init) => {
    req = { url, body: JSON.parse(init.body), headers: init.headers };
    return json({ audio_base64: Buffer.from('mp3').toString('base64'), alignment: { characters: [...text], character_start_times_seconds: [...text].map((_, i) => i * 0.1), character_end_times_seconds: [...text].map((_, i) => i * 0.1 + 0.1) } }, { headers: { 'request-id': 'r1' } });
  };
  const t = await synthesize({ key: 'k', voiceId: 'VOICE', model: MODEL, text, previous: 'قبل', next: 'بعد', fetchImpl });
  assert.match(req.url, /\/v1\/text-to-speech\/VOICE\/with-timestamps\?output_format=mp3_44100_192$/);
  assert.deepEqual(req.body.voice_settings, SETTINGS);
  assert.equal(req.body.model_id, 'eleven_v4');
  assert.equal(req.body.language_code, 'ar');
  assert.equal(req.body.previous_text, 'قبل');
  assert.equal(req.body.next_text, 'بعد');
  assert.equal(t.audio.toString(), 'mp3');
  assert.equal(t.starts.length, text.length);
  assert.equal(t.requestId, 'r1');
});

test('a take whose alignment does not match its text has no timings; 401 stops at once', async () => {
  const t = await synthesize({ key: 'k', voiceId: 'v', model: MODEL, text: 'ab', fetchImpl: async () => json({ audio_base64: '', alignment: { characters: ['x'], character_start_times_seconds: [0], character_end_times_seconds: [1] } }) });
  assert.equal(t.starts, null);
  let calls = 0;
  await assert.rejects(synthesize({ key: 'secret-key', voiceId: 'v', model: MODEL, text: 'ab', fetchImpl: async () => { calls++; return json({ detail: 'invalid api key' }, { status: 401 }); } }), (e) => /HTTP 401/.test(e.message) && !e.message.includes('secret-key'));
  assert.equal(calls, 1);
});

test('words are compared by sound: English terms in Arabic letters, prefixes, MSA for Egyptian', () => {
  assert.deepEqual(skeleton('render'), skeleton('رندر'));
  assert.ok(near(skeleton('log')[0], new Set(skeleton('بلوج'))));
  const r = wordScore('خلونا نشوف الـ test', ['دعونا نرى التست']);
  assert.equal(r.score, 1);
  const miss = wordScore('الـ commit صغير برسالة مكتوبة', ['الكوميت صغير']);
  assert.ok(miss.score < 0.85);
  assert.ok(miss.missed.includes('مكتوبة'));
});

// A buzz (rich in harmonics) at f Hz, optionally low-passed (darker).
function tone(dir, name, f, { seconds = 2, lowpass = null } = {}) {
  const out = join(dir, `${name}.wav`);
  const af = lowpass ? ['-af', `lowpass=f=${lowpass},lowpass=f=${lowpass}`] : [];
  spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `aevalsrc='0.4*(sin(2*PI*${f}*t)+0.6*sin(4*PI*${f}*t)+0.4*sin(6*PI*${f}*t)+0.3*sin(8*PI*${f}*t)+0.2*sin(14*PI*${f}*t)+0.15*sin(20*PI*${f}*t))':s=16000:d=${seconds}`, ...af, '-ac', '1', out]);
  return out;
}

test('pitch and brightness: a take off the episode\'s register is found', () => {
  const dir = mkdtempSync(join(tmpdir(), 'devya-tone-'));
  try {
    const p150 = voiceProfile(pcm16k(tone(dir, 'a', 150)));
    assert.ok(Math.abs(p150.pitch - 12 * Math.log2(150)) < 0.6, `pitch ${p150.pitch}`);
    const p300 = voiceProfile(pcm16k(tone(dir, 'b', 300)));
    assert.ok(Math.abs(p300.pitch - p150.pitch - 12) < 0.8);
    const dark = voiceProfile(pcm16k(tone(dir, 'c', 150, { lowpass: 700 })));
    assert.ok(dark.bright < p150.bright - 6, `bright ${dark.bright} vs ${p150.bright}`);
    const profiles = { B01: p150, B02: voiceProfile(pcm16k(tone(dir, 'd', 152))), B03: voiceProfile(pcm16k(tone(dir, 'e', 148))), B04: p300, B05: dark };
    const out = registerOutliers(profiles).map((o) => o.id).sort();
    assert.deepEqual(out, ['B04', 'B05']);
    assert.ok(heavyStretches(profiles).B05, 'the dark take is held heavy');
    assert.ok(!heavyStretches(profiles).B01);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
