// The timeline of a narrated video: where each beat's take sits, what the
// screen shows when, the chapters and the captions. Pure functions of the
// script (social/youtube/scripts/<slug>.json) and the takes' timings, so the
// assembly and the review gate agree on every second.
//
// Script: { slug, lang, slides: {<id>: {chapter?, ...}}, beats: [{ id, slide,
//   text, pause?, show?: [keys], focus?: key, marks?: [{ at: "<words>", show?, focus? }] }] }
// A beat's keys are revealed when its take starts; a mark fires on the first
// character of its words, so the screen moves on the word that names it.
// Take: { dur, starts: [s per character], ends: [...] } (trimmed clip).

export const LEAD_IN = 0.35;          // silence before the first word
export const PAUSE = 0.45;            // between beats on one slide
export const SLIDE_PAUSE = 0.85;      // before a beat that turns to a new slide
export const SLIDE_LEAD = 0.25;       // a new slide appears this long before its first word
export const MIN_STATE = 0.5;         // shortest time a screen state may hold
export const END_CARD = 12;           // last seconds: no speech, the end screen
export const SHORT_TAIL = 1.2;        // a Short holds its last frame this long
export const CUE_CHARS = 42;          // per caption line
export const CUE_MAX = 6.5;           // seconds per caption

const r3 = (x) => Math.round(x * 1000) / 1000;

// Index of `words` in `text` (first occurrence), or -1.
export const anchorIndex = (text, words) => String(text).indexOf(words);

// Places beats one after another. `takes` maps beat id -> take. Returns
// { beats: [{id, slide, t0, t1, take}], speechEnd }.
export function place(beats, takes, { leadIn = LEAD_IN } = {}) {
  let t = leadIn;
  const out = [];
  beats.forEach((b, i) => {
    const take = takes[b.id];
    if (!take) throw new Error(`no take for ${b.id}`);
    if (i) t += b.pause ?? (b.slide !== beats[i - 1].slide ? SLIDE_PAUSE : PAUSE);
    out.push({ id: b.id, slide: b.slide, t0: r3(t), t1: r3(t + take.dur), take });
    t += take.dur;
  });
  return { beats: out, speechEnd: r3(t) };
}

// Screen states [{t, slide, show: [keys], focus}] from the placed beats.
// Returns { states, problems } (an anchor not found in its beat's text, or a
// state that would hold under MIN_STATE).
export function screenStates(script, placed) {
  const byId = Object.fromEntries(script.beats.map((b) => [b.id, b]));
  const events = [];
  const problems = [];
  placed.beats.forEach((p, i) => {
    const b = byId[p.id];
    const newSlide = !i || p.slide !== placed.beats[i - 1].slide;
    const at = newSlide ? Math.max(0, p.t0 - (i ? SLIDE_LEAD : 0)) : p.t0;
    events.push({ t: i ? at : 0, slide: b.slide, show: b.show || [], focus: b.focus, reset: newSlide, beat: b.id });
    for (const m of b.marks || []) {
      const k = anchorIndex(b.text, m.at);
      if (k < 0) { problems.push(`${b.id}: mark "${m.at}" is not in the beat's text`); continue; }
      const s = p.take.starts?.[k];
      if (s == null) { problems.push(`${b.id}: no timing for mark "${m.at}" (take without alignment)`); continue; }
      events.push({ t: r3(p.t0 + s), slide: b.slide, show: m.show || [], focus: m.focus, reset: false, beat: b.id, mark: m.at });
    }
  });
  events.sort((a, b) => a.t - b.t);
  const states = [];
  let shown = [];
  let focus = null;
  for (const e of events) {
    if (e.reset) { shown = []; focus = null; }
    shown = [...new Set([...shown, ...e.show])];
    if (e.focus !== undefined) focus = e.focus;
    const s = { t: e.t, slide: e.slide, show: shown, focus, beat: e.beat };
    const last = states.at(-1);
    if (last && e.t - last.t < MIN_STATE) {
      // Too close to the change before it to be seen: the two become one state
      // (a slide that would show for under MIN_STATE is a script error).
      if (last.slide !== s.slide && states.length > 1) problems.push(`${e.beat}: slide ${s.slide} would follow ${last.slide} after ${(e.t - last.t).toFixed(2)} s`);
      states[states.length - 1] = { ...s, t: last.t };
    } else states.push(s);
  }
  return { states, problems };
}

// Chapters [{t, title}]: one per slide that names a chapter, at the moment it
// appears; the first is moved to 0:00.
export function chapters(script, states) {
  const out = [];
  let lastSlide = null;
  for (const s of states) {
    if (s.slide === lastSlide) continue;
    lastSlide = s.slide;
    const title = script.slides[s.slide]?.chapter;
    if (title) out.push({ t: Math.floor(s.t), title });
  }
  if (out.length) out[0] = { ...out[0], t: 0 };
  return out;
}

// Splits a beat's text into caption chunks: [{a, b}] character ranges, each at
// most two lines of CUE_CHARS, broken at sentence ends, then commas, then words.
export function chunks(text, max = CUE_CHARS * 2) {
  const out = [];
  let a = 0;
  while (a < text.length) {
    while (a < text.length && /\s/.test(text[a])) a++;
    if (a >= text.length) break;
    if (text.length - a <= max) { out.push({ a, b: text.length }); break; }
    const win = text.slice(a, a + max + 1);
    let cut = -1;
    for (const re of [/[.!?؟،,؛:](?=\s)/g, /\s/g]) {
      let m;
      const hits = [];
      while ((m = re.exec(win))) hits.push(m.index + (re.source.startsWith('[') ? 1 : 0));
      const ok = hits.filter((h) => h >= max * 0.45 && h <= max);
      if (ok.length) { cut = ok.at(-1); break; }
    }
    if (cut < 0) cut = win.lastIndexOf(' ') > 0 ? win.lastIndexOf(' ') : max;
    out.push({ a, b: a + cut });
    a += cut;
  }
  return out.map(({ a, b }) => ({ a, b: b - (/\s/.test(text[b - 1]) ? 1 : 0) })).filter(({ a, b }) => b > a);
}

// Two lines of at most CUE_CHARS, balanced.
export function twoLines(s, max = CUE_CHARS) {
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const mid = s.length / 2;
  let best = -1;
  for (let i = 0; i < s.length; i++) if (s[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  return best < 0 ? s : `${s.slice(0, best)}\n${s.slice(best + 1)}`;
}

// Caption cues [{start, end, text}] from the placed beats' character timings.
export function captionCues(script, placed) {
  const byId = Object.fromEntries(script.beats.map((b) => [b.id, b]));
  const cues = [];
  for (const p of placed.beats) {
    const text = byId[p.id].text;
    const { starts, ends } = p.take;
    // A chunk said over more than CUE_MAX seconds is split at the space nearest its middle in time.
    const split = ({ a, b }) => {
      const s = starts?.[a], e = ends?.[b - 1];
      if (s == null || e == null) throw new Error(`${p.id}: no character timings for captions`);
      if (e - s <= CUE_MAX) return [{ a, b }];
      const mid = (s + e) / 2;
      let cut = -1;
      for (let i = a + 1; i < b - 1; i++) if (text[i] === ' ' && (cut < 0 || Math.abs(starts[i] - mid) < Math.abs(starts[cut] - mid))) cut = i;
      return cut < 0 ? [{ a, b }] : [...split({ a, b: cut }), ...split({ a: cut + 1, b })];
    };
    for (const { a, b } of chunks(text).flatMap(split)) {
      cues.push({ start: r3(p.t0 + starts[a]), end: r3(p.t0 + ends[b - 1] + 0.25), text: twoLines(text.slice(a, b)) });
    }
  }
  // Never overlap; split any cue over CUE_MAX.
  for (let i = 0; i < cues.length - 1; i++) if (cues[i].end > cues[i + 1].start) cues[i].end = r3(cues[i + 1].start - 0.01);
  return cues;
}

// Problems with a cue list for a video of `duration` seconds.
export function cueProblems(cues, duration) {
  const out = [];
  cues.forEach((c, i) => {
    if (!(c.end > c.start)) out.push(`cue ${i + 1} ends before it starts`);
    if (c.end - c.start > CUE_MAX + 1.5) out.push(`cue ${i + 1} holds ${(c.end - c.start).toFixed(1)} s`);
    if (c.text.split('\n').length > 2 || c.text.split('\n').some((l) => l.length > CUE_CHARS + 12)) out.push(`cue ${i + 1} is longer than two lines`);
    if (i && c.start < cues[i - 1].end) out.push(`cue ${i + 1} overlaps the one before`);
    if (c.end > duration + 0.01) out.push(`cue ${i + 1} runs past the end of the video`);
  });
  return out;
}

const srtStamp = (s) => {
  const ms = Math.round(s * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
export const toSrt = (cues) => cues.map((c, i) => `${i + 1}\n${srtStamp(c.start)} --> ${srtStamp(c.end)}\n${c.text}\n`).join('\n');

// The whole long-form plan: placed beats, states (with the end card), chapters,
// cues and duration.
export function longForm(script, takes) {
  const placed = place(script.beats, takes);
  const { states, problems } = screenStates(script, placed);
  const end = r3(placed.speechEnd + 0.6);
  states.push({ t: end, slide: 'end', show: [], focus: null, beat: null });
  const duration = r3(end + END_CARD);
  const chs = chapters(script, states);
  return { placed, states, chapters: chs, cues: captionCues(script, placed), duration, speechEnd: placed.speechEnd, problems };
}

// A Short: the beats from `first` to `last` of a long-form script, on their own.
export function shortForm(script, takes, [first, last]) {
  const i = script.beats.findIndex((b) => b.id === first);
  const j = script.beats.findIndex((b) => b.id === last);
  if (i < 0 || j < i) throw new Error(`beats ${first}..${last} are not a range of ${script.slug}`);
  const sub = { ...script, beats: script.beats.slice(i, j + 1) };
  const placed = place(sub.beats, takes, { leadIn: 0.15 });
  const { states, problems } = screenStates(sub, placed);
  const duration = r3(placed.speechEnd + SHORT_TAIL);
  return { placed, states, cues: captionCues(sub, placed), duration, speechEnd: placed.speechEnd, problems, beats: sub.beats };
}

// [{t, dur, ...state}] segments covering [0, duration): each state holds until the next.
export function segments(states, duration) {
  return states.map((s, i) => ({ ...s, dur: r3((i + 1 < states.length ? states[i + 1].t : duration) - s.t) }));
}
