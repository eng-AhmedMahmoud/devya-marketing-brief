// Music bed and mixing (audio.mjs): licensed tracks only, duration, loudness
// (-14 LUFS integrated, bed -18..-22 LUFS under speech), true peak, fades and
// that music is actually present. Needs ffmpeg. node --test social/render/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import {
  MUSIC_DIR, TARGET_LUFS, BED_UNDER_SPEECH_RANGE, MAX_TRUE_PEAK, MIN_MUSIC_LUFS, FADE_IN, FADE_OUT,
  loadTracks, checkTrack, pickBed, measure, mixReelAudio, verifyReelAudio, probe, duckExpression, speechSegments,
} from './audio.mjs';

const tmp = () => mkdtempSync(join(tmpdir(), 'devya-audio-test-'));
const ff = (args) => { const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args]); assert.equal(r.status, 0, String(r.stderr)); };

test('every track is listed with a free commercial licence, matches its sha256 and is credited in LICENSES.md', () => {
  const tracks = loadTracks();
  assert.ok(tracks.length >= 2, 'at least two beds to rotate');
  const licences = readFileSync(join(MUSIC_DIR, 'LICENSES.md'), 'utf8');
  for (const t of tracks) {
    assert.doesNotThrow(() => checkTrack(t), t.file);
    assert.match(t.licence, /^(CC0-1\.0|CC-BY-4\.0)$/, `${t.file}: licence must allow commercial reuse and redistribution`);
    assert.ok(licences.includes(t.file), `${t.file} is credited in LICENSES.md`);
    assert.ok(licences.includes(t.sha256.slice(0, 8)), `${t.file} hash recorded in LICENSES.md`);
    assert.ok(t.windows.length >= 1);
    const { duration } = probe(t.path);
    for (const w of t.windows) assert.ok(w >= 0 && w + 10 <= duration, `${t.file} window ${w}s fits in ${duration}s`);
  }
});

test('a changed music file is refused', () => {
  const [t] = loadTracks();
  assert.throws(() => checkTrack({ ...t, sha256: '0'.repeat(64) }), /does not match its sha256/);
});

test('pickBed: same date, same bed; consecutive dates rotate through every track', () => {
  assert.deepEqual(pickBed('2026-11-28'), pickBed('2026-11-28'));
  const pairs = loadTracks().reduce((n, t) => n + t.windows.length, 0);
  const seen = new Set();
  for (let i = 0; i < pairs; i++) {
    const d = new Date(Date.UTC(2026, 11, 1 + i)).toISOString().slice(0, 10);
    const b = pickBed(d);
    seen.add(`${b.track.id}@${b.start}`);
  }
  assert.equal(seen.size, pairs);
});

test('music-only mix: 10 s, -14 LUFS integrated, true peak under -1 dBTP, faded in and out', () => {
  const dir = tmp();
  try {
    const out = join(dir, 'mix.wav');
    const r = mixReelAudio({ date: '2026-11-28', duration: 10, out });
    assert.ok(Math.abs(probe(out).duration - 10) < 0.05, `duration ${probe(out).duration}`);
    assert.ok(Math.abs(r.I - TARGET_LUFS) <= 0.5, `integrated ${r.I}`);
    assert.ok(r.TP <= MAX_TRUE_PEAK, `true peak ${r.TP}`);
    const head = measure(out, { start: 0, duration: 0.4 });
    const body = measure(out, { start: 3, duration: 4 });
    assert.ok(body.I >= MIN_MUSIC_LUFS, `music present: ${body.I}`);
    // ebur128 gates anything this quiet; a fade-in start reads as -70 / -inf.
    assert.ok(!(head.I > body.I - 6), `fades in: first 0.4 s ${head.I} vs body ${body.I}`);
    const tail = measure(out, { start: 10 - 0.4, duration: 0.4 });
    assert.ok(!(tail.I > body.I - 6), `fades out: last 0.4 s ${tail.I} vs body ${body.I}`);
    assert.ok(FADE_IN > 0 && FADE_OUT > 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('with narration the bed is ducked to -18..-22 LUFS under speech and the mix still lands at -14', () => {
  const dir = tmp();
  try {
    const voice = join(dir, 'voice.wav');
    // Speech-like band-limited noise from 2 s to 8 s, silence around it.
    ff(['-f', 'lavfi', '-i', 'anoisesrc=color=pink:r=48000:d=10:a=0.3', '-af', "bandpass=f=900:width_type=o:w=2,volume='between(t,2,8)':eval=frame", voice]);
    const segs = speechSegments(voice, 10);
    assert.equal(segs.length, 1);
    assert.ok(Math.abs(segs[0][0] - 2) < 0.15 && Math.abs(segs[0][1] - 8) < 0.15, JSON.stringify(segs));
    const out = join(dir, 'mix.wav');
    const r = mixReelAudio({ date: '2026-11-29', duration: 10, out, narration: voice });
    const [lo, hi] = BED_UNDER_SPEECH_RANGE;
    assert.ok(r.bedUnderSpeech >= lo && r.bedUnderSpeech <= hi, `bed under speech ${r.bedUnderSpeech}`);
    assert.ok(Math.abs(r.I - TARGET_LUFS) <= 0.5, `integrated ${r.I}`);
    assert.ok(r.TP <= MAX_TRUE_PEAK, `true peak ${r.TP}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('duckExpression ramps the bed down inside speech only', () => {
  assert.equal(duckExpression([], 0.5), '1');
  const e = duckExpression([[2, 8]], 0.5);
  assert.match(e, /^1-0\.5000\*min\(clip/);
});

test('verifyReelAudio: passes a mixed video, refuses a silent one and a wrong duration', () => {
  const dir = tmp();
  try {
    const wav = join(dir, 'mix.wav');
    mixReelAudio({ date: '2026-12-01', duration: 10, out: wav });
    const video = ['-f', 'lavfi', '-i', 'color=c=0x08090a:s=1080x1920:r=30:d=10'];
    const enc = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-t', '10'];
    const good = join(dir, 'good.mp4');
    ff([...video, '-i', wav, ...enc, good]);
    assert.deepEqual(verifyReelAudio(good, { duration: 10 }), []);
    const silent = join(dir, 'silent.mp4');
    ff([...video, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', ...enc, silent]);
    const p = verifyReelAudio(silent, { duration: 10 }).join('; ');
    assert.match(p, /music not audible/);
    assert.match(p, /integrated loudness/);
    const short = join(dir, 'short.mp4');
    ff([...video, '-i', wav, ...enc.slice(0, -2), '-t', '8', short]);
    assert.match(verifyReelAudio(short, { duration: 10 }).join(), /duration 8\.\d+ s, expected 10 s/);
    const mute = join(dir, 'mute.mp4');
    ff([...video, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-t', '10', mute]);
    assert.deepEqual(verifyReelAudio(mute, { duration: 10 }), ['no audio track']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
