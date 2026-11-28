// Sound for the YouTube videos: the narration laid out on its timeline, with
// one of the licensed CC0 music beds (social/music/, the same files and checks
// as the daily reels: render/audio.mjs) under it.
//
//   - the voice is levelled to VOICE_LUFS;
//   - the bed loops for the whole video, fades in and out, sits at BED_LUFS
//     where nobody speaks (the open and the end screen) and is ducked to
//     BED_UNDER_SPEECH under the narration (merged speech spans, so it does
//     not pump between sentences);
//   - the mix gets one static gain to TARGET_LUFS (YouTube plays at -14) and a
//     limiter keeps true peak at or under MAX_TRUE_PEAK.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadTracks, checkTrack, measure, shortTerm, duckExpression, probe, FADE_IN, FADE_OUT } from '../render/audio.mjs';

export const RATE = 48000;
export const TARGET_LUFS = -14;
export const MAX_TRUE_PEAK = -1;
export const VOICE_LUFS = -16;
export const BED_LUFS = -24;
export const BED_UNDER_SPEECH = -38;
// After the final gain: the bed under speech at least this far under the voice.
export const MIN_VOICE_OVER_BED = 15;
const LIMIT = 0.79;

const ff = (args) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-y', ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr.split('\n').slice(-4).join(' ')}`);
  return r.stderr;
};

export function decode(file, rate = RATE) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(rate), '-f', 'f32le', '-'], { maxBuffer: 1024 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`could not decode ${file}`);
  return new Float32Array(r.stdout.buffer.slice(r.stdout.byteOffset, r.stdout.byteOffset + r.stdout.byteLength));
}

// 16-bit PCM WAV, mono.
export function writeWav(file, samples, rate = RATE) {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  writeFileSync(file, b);
}

// Places clips [{file, t}] on a silent track of `duration` seconds.
export function layNarration(clips, duration, out) {
  const buf = new Float32Array(Math.ceil(duration * RATE));
  for (const c of clips) {
    const x = decode(c.file);
    const o = Math.round(c.t * RATE);
    for (let i = 0; i < x.length && o + i < buf.length; i++) buf[o + i] += x[i];
  }
  writeWav(out, buf);
}

// Speech spans merged across gaps shorter than `gap` seconds.
export function mergeSpans(spans, gap = 1.6) {
  const out = [];
  for (const [a, b] of [...spans].sort((p, q) => p[0] - q[0])) {
    if (out.length && a - out.at(-1)[1] < gap) out.at(-1)[1] = Math.max(out.at(-1)[1], b);
    else out.push([a, b]);
  }
  return out;
}

// The same bed for the same video: tracks picked by a hash of its slug.
export function pickLongBed(slug, tracks = loadTracks()) {
  const h = parseInt(createHash('sha256').update(slug).digest('hex').slice(0, 8), 16);
  const track = tracks[h % tracks.length];
  return { track, start: track.windows[h % track.windows.length] };
}

const dbToGain = (db) => 10 ** (db / 20);

// Mixes narration (a WAV on the video's timeline) and the bed into `out`
// (48 kHz stereo WAV). `speech`: [[start, end]] of the narration.
export function mixVideo({ slug, narration, duration, speech, out }) {
  const bed = pickLongBed(slug);
  const track = checkTrack(bed.track);
  const tmp = mkdtempSync(join(tmpdir(), 'devya-yt-mix-'));
  try {
    const music = join(tmp, 'music.wav');
    ff(['-stream_loop', '-1', '-i', track.path, '-vn', '-ac', '2', '-ar', String(RATE),
      '-af', `atrim=start=${bed.start}:duration=${duration},asetpts=N/SR/TB,apad=whole_dur=${duration},afade=t=in:st=0:d=${FADE_IN},afade=t=out:st=${(duration - FADE_OUT * 2).toFixed(3)}:d=${FADE_OUT * 2}`, '-t', String(duration), music]);
    const bedGain = BED_LUFS - measure(music).I;
    const voice = join(tmp, 'voice.wav');
    ff(['-i', narration, '-ac', '2', '-ar', String(RATE), '-af', `apad=whole_dur=${duration},atrim=0:${duration}`, voice]);
    const vI = measure(voice).I;
    const spans = mergeSpans(speech);
    const duck = dbToGain(BED_UNDER_SPEECH - BED_LUFS);
    const pre = join(tmp, 'pre.wav');
    ff(['-i', music, '-i', voice, '-filter_complex',
      `[0:a]volume=${bedGain.toFixed(3)}dB,volume='${duckExpression(spans, duck, 0.4)}':eval=frame[bed];[1:a]volume=${(VOICE_LUFS - vI).toFixed(3)}dB[vo];[bed][vo]amix=inputs=2:normalize=0:duration=first[mix]`,
      '-map', '[mix]', '-ar', String(RATE), pre]);
    const gainDb = TARGET_LUFS - measure(pre).I;
    ff(['-i', pre, '-af', `volume=${gainDb.toFixed(3)}dB,alimiter=limit=${LIMIT}:level=false:attack=5:release=60,atrim=0:${duration}`, '-ar', String(RATE), '-c:a', 'pcm_s16le', out]);
    // The bed alone with the gains it got, inside speech, against the voice alone.
    const bedOnly = join(tmp, 'bed.wav');
    ff(['-i', music, '-af', `volume=${(bedGain + gainDb).toFixed(3)}dB,volume='${duckExpression(spans, duck, 0.4)}':eval=frame`, bedOnly]);
    const st = shortTerm(bedOnly).filter(([t, s]) => Number.isFinite(s) && spans.some(([a, b]) => t >= a + 3 && t <= b));
    const bedUnderSpeech = st.length ? st.map(([, s]) => s).sort((a, b) => a - b)[Math.floor(st.length / 2)] : null;
    const voiceLevel = VOICE_LUFS + gainDb;
    const m = measure(out);
    return { track: track.id, title: track.title, artist: track.artist, licence: track.licence, start: bed.start, gainDb: +gainDb.toFixed(2), I: m.I, TP: m.TP, bedUnderSpeech, voiceLevel: +voiceLevel.toFixed(1) };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// Problems with a finished video's sound, or [].
export function soundProblems(file, mix, { duration, endCard = 0 } = {}) {
  const out = [];
  const p = probe(file);
  const a = p.streams.find((s) => s.codec_type === 'audio');
  if (!a) return ['no audio track'];
  if (Math.abs(p.duration - duration) > 0.1) out.push(`duration ${p.duration.toFixed(2)} s, timeline ${duration.toFixed(2)} s`);
  const m = measure(file);
  if (!(Math.abs(m.I - TARGET_LUFS) <= 1)) out.push(`integrated loudness ${m.I} LUFS, expected ${TARGET_LUFS} ±1`);
  if (!(m.TP <= MAX_TRUE_PEAK + 0.05)) out.push(`true peak ${m.TP} dBTP, max ${MAX_TRUE_PEAK}`);
  if (endCard > 4) {
    const e = measure(file, { start: duration - endCard + 1, duration: endCard - 3 });
    if (!(e.I >= -32)) out.push(`music not audible on the end screen: ${e.I} LUFS`);
  }
  if (mix.bedUnderSpeech != null && mix.voiceLevel - mix.bedUnderSpeech < MIN_VOICE_OVER_BED) out.push(`music under the voice is only ${(mix.voiceLevel - mix.bedUnderSpeech).toFixed(1)} LU below it (min ${MIN_VOICE_OVER_BED})`);
  return out;
}
