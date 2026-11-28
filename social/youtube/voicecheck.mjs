// The narration checks from the Catalyst lesson kit's review gate
// (tools/review.py, tools/thick.py), for the cloned voice:
//
//   words  each take as Whisper hears it against the script. Words are
//          compared by sound, not spelling: both sides become a consonant
//          skeleton (render = رندر = rndr), because Whisper writes Egyptian in
//          formal spelling and English terms in Arabic letters. A take under
//          85% is heard three more ways (as English, primed with the line's own
//          Arabic, unprompted) before it is called wrong.
//   tone   each take's median pitch and brightness (1-4 kHz against
//          0.1-1 kHz) against the episode's other takes: a take over 3 st off
//          the median or 4 dB darker is off-register and is taken again; inside
//          a take, a held stretch (1.2 s or more) 7 dB darker than the episode,
//          or 4 dB darker and 3 st lower, is a "heavy" moment the developer
//          hears as the voice turning thick.

import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const WHISPER_MODEL = process.env.WHISPER_MODEL || join(homedir(), '.cache/whisper-cpp/ggml-large-v3-turbo-q5_0.bin');
export const WORD_PASS = 0.85;
export const REGISTER_ST = 3;
export const REGISTER_DARK_DB = 4;
export const HELD_SECONDS = 1.2;
export const VERY_DARK_DB = 7;
export const HEAVY = { dark: 4, low: 3 };
const SR = 16000;

// --- words -----------------------------------------------------------------

const SK = {
  ...Object.fromEntries([...'bdfhklmnrstwyz'].map((c) => [c, c])), p: 'b', v: 'f', c: 'k', q: 'k', g: 'g', j: 'g', x: 'ks',
  'ب': 'b', 'ت': 't', 'ث': 's', 'ج': 'g', 'ح': 'h', 'خ': 'k', 'د': 'd', 'ذ': 'z', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 's',
  'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': '', 'غ': 'g', 'ف': 'f', 'ق': 'k', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
  'ه': 'h', 'ة': 'h', 'و': 'w', 'ي': 'y', 'ى': 'y', 'گ': 'g',
};

// A text as consonant skeletons, one per word of two letters or more.
export function skeleton(t) {
  t = String(t).replace(/([a-z])([A-Z])/g, '$1 $2');
  t = t.normalize('NFKD').replace(/[̀-ًͯ-ٰٟ]/g, '').toLowerCase().replace(/ـ/g, ' ');
  t = t.replace(/\bdot\b/g, ' ');
  const out = [];
  for (let w of t.match(/[a-z0-9]+|[؀-ۿ]+/g) || []) {
    if (/[؀-ۿ]/.test(w)) w = w.replace(/^(وال|بال|فال|لل|ال)/, '');
    let k = [...w].map((c) => SK[c] ?? (/[0-9]/.test(c) ? c : '')).join('');
    k = k.replace(/(.)\1+/g, '$1').replace(/[hwy]/g, '');
    if (k.length >= 2) out.push(k);
  }
  return out;
}

// Egyptian words Whisper writes in formal Arabic.
export const MSA = {
  'خلونا': ['دعونا', 'لنرى', 'هيا'], 'نشوف': ['نرى', 'لنرى', 'نشاهد'], 'هنعمل': ['سنقوم', 'سنعمل', 'نقوم'], 'شايف': ['يرى', 'يشاهد'],
  'عشان': ['لكي', 'لأن', 'حتى'], 'اللي': ['الذي', 'التي'], 'ده': ['هذا'], 'دي': ['هذه'], 'إزاي': ['كيف'], 'ليه': ['لماذا'], 'إيه': ['ماذا', 'ما'],
  'كده': ['هكذا'], 'دلوقتي': ['الآن'], 'عايز': ['تريد', 'يريد'], 'مش': ['ليس', 'لا'], 'بتاعك': ['الخاص'], 'كمان': ['أيضا'],
};

const sub1 = (a, b) => Math.abs(a.length - b.length) <= 1 && [...a].reduce((n, c, i) => n + (c !== b[i] ? 1 : 0), 0) + Math.abs(a.length - b.length) <= 1;
export function near(a, heard) {
  if (heard.has(a)) return true;
  const z = a.replace(/z/g, 's');
  for (const b of heard) {
    const bz = b.replace(/z/g, 's');
    if (bz === z) return true;
    if (b.length > a.length && 'blfk'.includes(b[0]) && b.slice(1).replace(/z/g, 's') === z) return true;
    if (a.length >= 3 && sub1(a, b)) return true;
  }
  return false;
}

// Share of the script's words heard, and which words were missed.
export function wordScore(script, heardTexts) {
  const heard = new Set(heardTexts.flatMap(skeleton));
  const want = skeleton(script);
  if (heardTexts.some((h) => /\d/.test(h))) for (const k of skeleton('zero one two three four five six seven eight nine ten twenty thirty forty fifty hundred thousand percent صفر واحد اتنين تلاتة أربعة خمسة ستة سبعة تمانية تسعة عشرة عشرين تلاتين خمسين مية ألف')) heard.add(k);
  for (const [egy, msa] of Object.entries(MSA)) if (msa.some((m) => skeleton(m).some((k) => near(k, heard)))) skeleton(egy).forEach((k) => heard.add(k));
  const missKeys = want.filter((k) => !near(k, heard));
  const words = String(script).match(/\S+/g) || [];
  const missed = words.filter((w) => { const k = skeleton(w); return k.length && !k.every((x) => near(x, heard)); });
  return { score: 1 - missKeys.length / Math.max(1, want.length), missed };
}

const whisper = (wav, lang, prompt) => {
  const args = ['-m', WHISPER_MODEL, '-l', lang, '-nt', '-np', ...(prompt ? ['--prompt', prompt] : []), '-f', wav];
  const r = spawnSync('whisper-cli', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`whisper-cli failed: ${(r.stderr || '').slice(-300)}`);
  return r.stdout.trim();
};

// Hears a 16 kHz mono WAV of one take against its script line.
export function heardCheck(text, wav) {
  const terms = [...new Set(text.match(/[A-Za-z][A-Za-z.]+/g) || [])].slice(0, 40).join(', ');
  const passes = [whisper(wav, 'ar', terms)];
  let res = wordScore(text, passes);
  if (res.score < WORD_PASS) {
    const ar = (text.match(/[؀-ۿ]+/g) || []).slice(0, 60).join(' ');
    passes.push(whisper(wav, 'en', terms), whisper(wav, 'ar', ar), whisper(wav, 'ar', ''));
    res = wordScore(text, passes);
  }
  return { ...res, heard: passes[0], ok: res.score >= WORD_PASS };
}

// --- tone ------------------------------------------------------------------

export function pcm16k(file, { start, duration } = {}) {
  const r = spawnSync('ffmpeg', ['-v', 'error', ...(start != null ? ['-ss', String(start)] : []), ...(duration != null ? ['-t', String(duration)] : []), '-i', file, '-vn', '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 512 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`ffmpeg could not decode ${file}`);
  return new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.byteLength / 4);
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
        const vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
      }
    }
  }
}

const WIN = 640, HOP = 320, NFFT = 1024;
const HANN = Float64Array.from({ length: WIN }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (WIN - 1)));

// Per 20 ms frame: level (dB), voiced, pitch (semitones over 1 Hz), brightness (dB).
export function frames(x) {
  const n = Math.max(0, Math.floor((x.length - WIN) / HOP));
  const lo = Math.floor(SR / 400), hi = Math.floor(SR / 75);
  const cs = new Float64Array(hi + 2);
  const out = [];
  const re = new Float64Array(NFFT), im = new Float64Array(NFFT);
  const binHz = SR / NFFT;
  for (let f = 0; f < n; f++) {
    const o = f * HOP;
    let e = 0;
    for (let i = 0; i < WIN; i++) e += x[o + i] * x[o + i];
    const db = 10 * Math.log10(e / WIN + 1e-12);
    let best = 0, lag = lo;
    if (e > 1e-6) {
      for (let l = lo; l <= hi; l++) {
        let s = 0, e1 = 0, e2 = 0;
        for (let i = 0; i < WIN - l; i++) { const a = x[o + i], b = x[o + i + l]; s += a * b; e1 += a * a; e2 += b * b; }
        cs[l] = s / Math.sqrt(e1 * e2 + 1e-12);
        if (cs[l] > best) best = cs[l];
      }
      // The shortest period that correlates almost as well as the best one:
      // a multiple of the period scores the same and would read an octave low.
      for (let l = lo + 1; l < hi; l++) if (cs[l] >= 0.9 * best && cs[l] >= cs[l - 1] && cs[l] >= cs[l + 1]) { lag = l; break; }
    }
    re.fill(0); im.fill(0);
    for (let i = 0; i < WIN; i++) re[i] = x[o + i] * HANN[i];
    fft(re, im);
    let low = 0, high = 0;
    for (let k = 0; k < NFFT / 2; k++) {
      const hz = k * binHz, p = re[k] * re[k] + im[k] * im[k];
      if (hz >= 100 && hz < 1000) low += p; else if (hz >= 1000 && hz < 4000) high += p;
    }
    out.push({ t: o / SR, db, voiced: best > 0.5, st: 12 * Math.log2(SR / lag), bright: 10 * Math.log10((high + 1e-12) / (low + 1e-12)) });
  }
  return out;
}

const median = (a) => { if (!a.length) return NaN; const s = [...a].sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };

// Voiced speech frames of a take, with its median pitch and brightness.
export function voiceProfile(x) {
  const fr = frames(x);
  if (!fr.length) return { frames: [], pitch: NaN, bright: NaN };
  const floor = pct(fr.map((f) => f.db), 95) - 30;
  const sp = fr.filter((f) => f.voiced && f.db > floor);
  return { frames: sp, pitch: median(sp.map((f) => f.st)), bright: median(sp.map((f) => f.bright)) };
}

// Takes whose register is off the episode's: [{id, dSt, dDb}].
export function registerOutliers(profiles) {
  const ids = Object.keys(profiles).filter((k) => Number.isFinite(profiles[k].pitch));
  const mp = median(ids.map((k) => profiles[k].pitch)), mb = median(ids.map((k) => profiles[k].bright));
  return ids.map((id) => ({ id, dSt: profiles[id].pitch - mp, dDb: profiles[id].bright - mb }))
    .filter((o) => Math.abs(o.dSt) > REGISTER_ST || o.dDb < -REGISTER_DARK_DB);
}

// Held heavy/dark stretches inside each take against the episode's medians:
// {id: [[start, end], ...]}.
export function heavyStretches(profiles) {
  const ids = Object.keys(profiles).filter((k) => Number.isFinite(profiles[k].pitch));
  const mp = median(ids.map((k) => profiles[k].pitch)), mb = median(ids.map((k) => profiles[k].bright));
  const out = {};
  for (const id of ids) {
    const fr = profiles[id].frames;
    const runs = [];
    // 0.6 s windows every 0.3 s of voiced speech.
    const wins = [];
    for (let a = 0; fr.length && a <= fr.at(-1).t; a += 0.3) {
      const w = fr.filter((f) => f.t >= a && f.t < a + 0.6);
      if (w.length < 9) continue;
      const b = median(w.map((f) => f.bright)) - mb, p = median(w.map((f) => f.st)) - mp;
      wins.push({ a, bad: b <= -VERY_DARK_DB || (b <= -HEAVY.dark && p <= -HEAVY.low) });
    }
    let start = null, last = null;
    for (const w of [...wins, { a: Infinity, bad: false }]) {
      if (w.bad && start === null) start = w.a;
      if (!w.bad && start !== null) { if (last + 0.6 - start >= HELD_SECONDS) runs.push([+start.toFixed(2), +(last + 0.6).toFixed(2)]); start = null; }
      if (w.bad) last = w.a;
    }
    if (runs.length) out[id] = runs;
  }
  return out;
}
