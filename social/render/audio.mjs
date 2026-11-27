// Audio for the daily vertical video: a licensed music bed (social/music/,
// licences in LICENSES.md) mixed for social networks with ffmpeg.
//
//   - the track and its 10-second window are picked by date, so a day always
//     gets the same bed and consecutive days rotate;
//   - the bed fades in (FADE_IN s) and out (FADE_OUT s);
//   - under narration (optional voice file) the bed is ducked by volume
//     automation to BED_UNDER_SPEECH LUFS, narration sits at VOICE_LUFS;
//   - the final mix gets one static gain to TARGET_LUFS integrated, then a
//     peak limiter so true peak stays at or under MAX_TRUE_PEAK dBTP.
//
// verifyReelAudio() measures a finished MP4: duration, loudness, true peak and
// that music is actually audible. render-reel.mjs refuses a video that fails.

import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const MUSIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'music');
export const TARGET_LUFS = -14;
export const TARGET_TOLERANCE = 1;
export const BED_LUFS = -16;
export const BED_UNDER_SPEECH = -20;
export const BED_UNDER_SPEECH_RANGE = [-22, -18];
export const VOICE_LUFS = -15;
export const MAX_TRUE_PEAK = -1;
export const FADE_IN = 1.0;
export const FADE_OUT = 1.5;
// Quietest the middle of a finished video may be and still count as "music present".
export const MIN_MUSIC_LUFS = -24;
const RATE = 48000;
const LIMIT = 0.79; // alimiter ceiling, linear (about -2 dBFS) leaves room for AAC overshoot

const ff = (args) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`ffmpeg ${args.join(' ')} failed: ${r.stderr.split('\n').slice(-4).join(' ')}`);
  return r.stderr;
};

export function loadTracks(dir = MUSIC_DIR) {
  return JSON.parse(readFileSync(join(dir, 'tracks.json'), 'utf8')).tracks.map((t) => ({ ...t, path: join(dir, t.file) }));
}

export function checkTrack(t) {
  if (!existsSync(t.path)) throw new Error(`music: ${t.file} is missing`);
  const sha = createHash('sha256').update(readFileSync(t.path)).digest('hex');
  if (sha !== t.sha256) throw new Error(`music: ${t.file} does not match its sha256 in tracks.json (licence record)`);
  return t;
}

// Same date, same bed; consecutive dates walk through every track/window pair.
export function pickBed(date, tracks = loadTracks()) {
  const pairs = tracks.flatMap((t) => t.windows.map((start) => ({ track: t, start })));
  const n = Math.round(Date.parse(`${date}T12:00:00Z`) / 86400000);
  const i = ((n * 7) % pairs.length + pairs.length) % pairs.length;
  return pairs[i];
}

// EBU R128 summary of a file (optionally a slice): integrated I, LRA, true peak.
export function measure(file, { start, duration } = {}) {
  const slice = [...(start != null ? ['-ss', String(start)] : []), ...(duration != null ? ['-t', String(duration)] : [])];
  const err = ff([...slice, '-i', file, '-map', '0:a:0', '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const sum = err.slice(err.lastIndexOf('Summary:'));
  const num = (re) => { const m = sum.match(re); return m ? parseFloat(m[1]) : NaN; };
  return { I: num(/I:\s+(-?[\d.]+|-inf) LUFS/), LRA: num(/LRA:\s+(-?[\d.]+) LU/), TP: num(/Peak:\s+(-?[\d.]+|-inf) dBFS/) };
}

// Short-term (3 s) loudness every 0.1 s: [[t, S], ...].
export function shortTerm(file) {
  const err = ff(['-i', file, '-map', '0:a:0', '-af', 'ebur128=metadata=1,ametadata=mode=print:key=lavfi.r128.S', '-f', 'null', '-']);
  const ts = [...err.matchAll(/pts_time:([\d.]+)/g)].map((m) => parseFloat(m[1]));
  const ss = [...err.matchAll(/lavfi\.r128\.S=(-?[\d.]+|-inf)/g)].map((m) => parseFloat(m[1]));
  return ts.map((t, i) => [t, ss[i]]);
}

// Speech segments of a narration file: [[start, end], ...] (silencedetect).
export function speechSegments(file, duration) {
  const err = ff(['-i', file, '-af', 'silencedetect=noise=-40dB:d=0.3', '-f', 'null', '-']);
  const starts = [...err.matchAll(/silence_start: (-?[\d.]+)/g)].map((m) => Math.max(0, parseFloat(m[1])));
  const ends = [...err.matchAll(/silence_end: ([\d.]+)/g)].map((m) => parseFloat(m[1]));
  const segs = [];
  let cursor = 0;
  starts.forEach((s, i) => { if (s - cursor > 0.05) segs.push([cursor, s]); cursor = ends[i] ?? duration; });
  if (cursor < duration - 0.05 && ends.length === starts.length) segs.push([cursor, duration]);
  return segs.filter(([a, b]) => b - a >= 0.2);
}

// ffmpeg volume expression: 1 outside speech, `duck` (linear) inside, with ramps.
export function duckExpression(segments, duck, ramp = 0.25) {
  if (!segments.length) return '1';
  const inside = segments.map(([a, b]) => `min(clip((t-${(a - ramp).toFixed(3)})/${ramp},0,1),clip((${(b + ramp).toFixed(3)}-t)/${ramp},0,1))`);
  const d = inside.reduce((acc, e) => `max(${acc},${e})`);
  return `1-${(1 - duck).toFixed(4)}*${d}`;
}

const dbToGain = (db) => 10 ** (db / 20);

// Mixes the bed (and optional narration) to a 48 kHz stereo WAV at `out`.
// Returns what it did and measured: {track, start, gainDb, I, TP, bedUnderSpeech}.
export function mixReelAudio({ date, duration, out, narration = null, bed = pickBed(date) }) {
  const track = checkTrack(bed.track);
  const tmp = mkdtempSync(join(tmpdir(), 'devya-mix-'));
  try {
    const music = join(tmp, 'music.wav');
    ff(['-y', '-ss', String(bed.start), '-t', String(duration), '-i', track.path, '-vn', '-ac', '2', '-ar', String(RATE),
      '-af', `atrim=0:${duration},asetpts=N/SR/TB,apad=whole_dur=${duration},afade=t=in:st=0:d=${FADE_IN},afade=t=out:st=${duration - FADE_OUT}:d=${FADE_OUT}`, music]);
    const mI = measure(music).I;
    const bedGain = BED_LUFS - mI;
    let segments = [];
    let chain;
    const inputs = ['-i', music];
    if (narration) {
      // Never cut a sentence off: the speech must end before the video does
      // (trailing silence in the file is fine).
      const vDur = probe(narration).duration;
      const spoken = speechSegments(narration, vDur);
      const lastWord = spoken.length ? spoken.at(-1)[1] : 0;
      if (!(lastWord <= duration - 0.2)) throw new Error(`narration ${narration} speaks until ${lastWord.toFixed(2)} s; it must end before ${(duration - 0.2).toFixed(1)} s`);
      const voice = join(tmp, 'voice.wav');
      ff(['-y', '-i', narration, '-ac', '2', '-ar', String(RATE), '-af', `apad=whole_dur=${duration},atrim=0:${duration}`, voice]);
      const vI = measure(voice).I;
      segments = speechSegments(voice, duration);
      const duck = dbToGain(BED_UNDER_SPEECH - BED_LUFS);
      inputs.push('-i', voice);
      chain = `[0:a]volume=${bedGain.toFixed(3)}dB,volume='${duckExpression(segments, duck)}':eval=frame[bed];[1:a]volume=${(VOICE_LUFS - vI).toFixed(3)}dB[vo];[bed][vo]amix=inputs=2:normalize=0:duration=first[mix]`;
    } else {
      chain = `[0:a]volume=${bedGain.toFixed(3)}dB[mix]`;
    }
    const pre = join(tmp, 'pre.wav');
    ff(['-y', ...inputs, '-filter_complex', chain, '-map', '[mix]', '-ar', String(RATE), pre]);
    const gainDb = TARGET_LUFS - measure(pre).I;
    ff(['-y', '-i', pre, '-af', `volume=${gainDb.toFixed(3)}dB,alimiter=limit=${LIMIT}:level=false:attack=5:release=60,atrim=0:${duration}`, '-ar', String(RATE), '-c:a', 'pcm_s16le', out]);
    const m = measure(out);
    let bedUnderSpeech = null;
    if (segments.length) {
      // The bed alone with exactly the gains it got in the mix, measured inside speech.
      const bedOnly = join(tmp, 'bed.wav');
      ff(['-y', '-i', music, '-af', `volume=${(bedGain + gainDb).toFixed(3)}dB,volume='${duckExpression(segments, dbToGain(BED_UNDER_SPEECH - BED_LUFS))}':eval=frame`, bedOnly]);
      const st = shortTerm(bedOnly);
      const inside = st.filter(([t, s]) => Number.isFinite(s) && segments.some(([a, b]) => t >= a + 2.5 && t <= b));
      const vals = (inside.length ? inside : st.filter(([t]) => segments.some(([a, b]) => t >= a + 0.5 && t <= b))).map(([, s]) => s).filter(Number.isFinite);
      bedUnderSpeech = vals.length ? vals.sort((a, b) => a - b)[Math.floor(vals.length / 2)] : null;
    }
    return { track: track.id, title: track.title, artist: track.artist, licence: track.licence, start: bed.start, gainDb: +gainDb.toFixed(2), I: m.I, TP: m.TP, segments, bedUnderSpeech };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

export function probe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name,sample_rate,channels,width,height', '-of', 'json', file], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffprobe failed for ${file}`);
  const j = JSON.parse(r.stdout);
  return { duration: parseFloat(j.format.duration), streams: j.streams };
}

// Problems with a finished video's audio, or [] when it is fit to publish.
export function verifyReelAudio(file, { duration }) {
  const out = [];
  const p = probe(file);
  const a = p.streams.find((s) => s.codec_type === 'audio');
  if (!a) return ['no audio track'];
  if (Math.abs(p.duration - duration) > 0.1) out.push(`duration ${p.duration.toFixed(2)} s, expected ${duration} s`);
  const m = measure(file);
  if (!(Math.abs(m.I - TARGET_LUFS) <= TARGET_TOLERANCE)) out.push(`integrated loudness ${m.I} LUFS, expected ${TARGET_LUFS} ±${TARGET_TOLERANCE}`);
  if (!(m.TP <= MAX_TRUE_PEAK + 0.05)) out.push(`true peak ${m.TP} dBTP, max ${MAX_TRUE_PEAK}`);
  const mid = measure(file, { start: FADE_IN + 1, duration: duration - FADE_IN - FADE_OUT - 2 });
  if (!(mid.I >= MIN_MUSIC_LUFS)) out.push(`music not audible: ${mid.I} LUFS between the fades (min ${MIN_MUSIC_LUFS})`);
  return out;
}
