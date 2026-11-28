#!/usr/bin/env node
// Makes a YouTube episode end to end, one stage at a time:
//
//   node produce.mjs quota                     the voice account's credits (never the key)
//   node produce.mjs narrate <slug> [--only B03,B07] [--dry-run]
//        takes in the cloned voice for every beat whose text changed (quota checked first)
//   node produce.mjs check <slug>              word check (Whisper) and tone check of every take
//   node produce.mjs render <slug>             slides, sound, video, captions, chapters,
//                                              thumbnail and metadata, for the long-form and its Shorts
//   node produce.mjs gate <slug>               the review gate; writes out/<slug>/review.md
//   node produce.mjs all <slug>                narrate, check, render, gate; stops at the first failure
//   node produce.mjs meta <slug>               metadata.json again (a Short links its uploaded long-form)
//   node produce.mjs status                    every episode and where it stands
//
// <slug> is a long-form episode in episodes.json; its Shorts are built and
// gated with it. Big files go to build/ (git-ignored); what is uploaded with
// the video and kept as the record goes to out/<slug>/ (metadata.json,
// captions.ar.srt, thumbnail.png, review.md).
// Exit codes: 1 a check failed, 8 the voice quota would need paying for.

import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, statSync, appendFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadRegistry, composeDescription, episodeProblems, YT_DIR, stamp, chapterProblems } from './youtube.mjs';
import { apiKey, voiceState, loadLexicon, applyLexicon, mapBack, takeKey, subscription, quotaPlan, synthesize, QuotaExceeded, RESERVE } from './voice.mjs';
import { heardCheck, pcm16k, voiceProfile, registerOutliers, heavyStretches } from './voicecheck.mjs';
import { longForm, shortForm, segments, toSrt, cueProblems, MIN_STATE, END_CARD } from './timeline.mjs';
import { slideHtml, applyState, thumbnailHtml, layoutProblems, SIZES } from './slides.mjs';
import { decode, writeWav, layNarration, mixVideo, soundProblems, RATE } from './mix.mjs';
import { probe } from '../render/audio.mjs';
import { brandProblems } from '../render/brand-check.mjs';
import { offBrandColours } from '../render/brand.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(HERE, '..', 'render', 'package.json'));
const { chromium } = require('playwright-core');

const BUILD = process.env.YT_BUILD_DIR || join(HERE, 'build');
const OUT = join(HERE, 'out');
const args = process.argv.slice(2);
const cmd = args[0];
const slug = args[1] && !args[1].startsWith('--') ? args[1] : null;
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const flag = (n) => args.includes(n);

const reg = loadRegistry();
const episode = (s) => reg.episodes.find((e) => e.slug === s) || die(`no episode "${s}" in episodes.json`);
const shortsOf = (s) => reg.episodes.filter((e) => e.kind === 'short' && e.parent === s);
const loadScript = (ep) => JSON.parse(readFileSync(join(HERE, ep.script), 'utf8'));
function die(msg, code = 1) { console.error(msg); process.exit(code); }
const dirs = (s) => { const b = join(BUILD, s), o = join(OUT, s); for (const d of [b, o]) mkdirSync(d, { recursive: true }); return { b, o }; };
const ff = (a) => { const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-y', ...a], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }); if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr.split('\n').slice(-5).join(' ')}`); return r.stderr; };
const readJson = (f, d = null) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : d);

// --- narrate ---------------------------------------------------------------

async function narrate(s) {
  const ep = episode(s);
  const script = loadScript(ep);
  const { b } = dirs(s);
  mkdirSync(join(b, 'takes'), { recursive: true });
  const lex = loadLexicon();
  const v = voiceState();
  const only = new Set((opt('--only') || '').split(',').filter(Boolean));
  const sent = script.beats.map((bt) => applyLexicon(bt.text, { ...lex, ...(bt.lex || {}) }));
  const todo = script.beats.map((bt, i) => ({ bt, i, s: sent[i], key: takeKey(sent[i].sent, v.voiceId, v.model) }))
    .filter(({ bt, key }) => (only.size ? only.has(bt.id) : readJson(join(b, 'takes', `${bt.id}.json`))?.key !== key));
  const needed = todo.reduce((n, t) => n + t.s.sent.length, 0);
  const key = apiKey();
  const plan = quotaPlan(await subscription(key), needed);
  console.log(`${s}: ${todo.length} of ${script.beats.length} takes to render, ${needed.toLocaleString()} characters; account has ${plan.remaining.toLocaleString()} left (reserve ${RESERVE.toLocaleString()}), resets ${plan.resets}`);
  if (!plan.ok) throw new QuotaExceeded(plan);
  if (flag('--dry-run') || !todo.length) return;
  let used = 0;
  for (const { bt, i, s: snt, key: k } of todo) {
    const prev = i ? sent[i - 1].sent : undefined, next = i + 1 < sent.length ? sent[i + 1].sent : undefined;
    const t = await synthesize({ key, voiceId: v.voiceId, model: v.model, text: snt.sent, previous: prev, next, lang: script.lang || 'ar' });
    const mapped = t.starts ? mapBack(bt.text, snt.spans, t.starts, t.ends) : { starts: null, ends: null };
    writeFileSync(join(b, 'takes', `${bt.id}.mp3`), t.audio);
    writeFileSync(join(b, 'takes', `${bt.id}.json`), JSON.stringify({ text: bt.text, sent: snt.sent, key: k, requestId: t.requestId, chars: snt.sent.length, starts: mapped.starts, ends: mapped.ends, at: new Date().toISOString() }));
    used += snt.sent.length;
    appendFileSync(join(BUILD, 'credits.jsonl'), JSON.stringify({ at: new Date().toISOString(), slug: s, beat: bt.id, chars: snt.sent.length }) + '\n');
    console.log(`${bt.id}  ${mapped.starts ? 'aligned' : 'NO ALIGNMENT'}  ${snt.sent.length} chars`);
  }
  console.log(`${used.toLocaleString()} characters sent`);
}

// --- check -----------------------------------------------------------------

// Trims each take to its speech (from the character timings) into clips/.
function clips(s, script) {
  const { b } = dirs(s);
  for (const d of ['clips', 'clips16']) mkdirSync(join(b, d), { recursive: true });
  const takes = {};
  for (const bt of script.beats) {
    const meta = readJson(join(b, 'takes', `${bt.id}.json`));
    if (!meta) throw new Error(`${bt.id}: no take (run narrate)`);
    if (meta.text !== bt.text) throw new Error(`${bt.id}: the take is for older text (run narrate)`);
    if (!meta.starts) throw new Error(`${bt.id}: the take has no character timings`);
    const x = decode(join(b, 'takes', `${bt.id}.mp3`));
    const dur = x.length / RATE;
    const idx = [...bt.text].map((c, i) => (/\s/.test(c) ? null : i)).filter((i) => i !== null);
    const s0 = Math.min(...idx.map((i) => meta.starts[i])), e1 = Math.max(...idx.map((i) => meta.ends[i]));
    const a = Math.max(0, s0 - 0.08), z = Math.min(dur, e1 + 0.3);
    const y = x.slice(Math.round(a * RATE), Math.round(z * RATE));
    const fade = Math.round(0.012 * RATE);
    for (let i = 0; i < fade && i < y.length; i++) { y[i] *= i / fade; y[y.length - 1 - i] *= i / fade; }
    const wav = join(b, 'clips', `${bt.id}.wav`);
    writeWav(wav, y);
    ff(['-v', 'error', '-i', wav, '-ar', '16000', '-ac', '1', join(b, 'clips16', `${bt.id}.wav`)]);
    takes[bt.id] = { dur: +(y.length / RATE).toFixed(3), starts: meta.starts.map((t) => +(t - a).toFixed(3)), ends: meta.ends.map((t) => +(t - a).toFixed(3)), file: wav };
  }
  writeFileSync(join(b, 'takes.json'), JSON.stringify(takes));
  return takes;
}

function check(s) {
  const ep = episode(s);
  const script = loadScript(ep);
  const { b } = dirs(s);
  clips(s, script);
  const prev = readJson(join(b, 'voicecheck.json'), { words: {} });
  const words = {}, profiles = {};
  for (const bt of script.beats) {
    const meta = readJson(join(b, 'takes', `${bt.id}.json`));
    const cached = prev.words[bt.id];
    words[bt.id] = cached && cached.key === meta.key ? cached : { key: meta.key, ...heardCheck(bt.text, join(b, 'clips16', `${bt.id}.wav`)) };
    profiles[bt.id] = voiceProfile(pcm16k(join(b, 'clips16', `${bt.id}.wav`)));
    if (!words[bt.id].ok) console.log(`${bt.id} words ${(words[bt.id].score * 100).toFixed(0)}% missing ${words[bt.id].missed.slice(0, 8).join(' ')} | heard: ${words[bt.id].heard.slice(0, 200)}`);
  }
  const register = registerOutliers(profiles);
  const heavy = heavyStretches(profiles);
  const accepted = script.accept || {};
  const failWords = Object.entries(words).filter(([id, w]) => !w.ok && !accepted[id]?.words).map(([id]) => id);
  const failRegister = register.filter((r) => !accepted[r.id]?.tone).map((r) => r.id);
  const failHeavy = Object.keys(heavy).filter((id) => !accepted[id]?.tone);
  const res = {
    at: new Date().toISOString(), words, register, heavy,
    pitch: Object.fromEntries(Object.entries(profiles).map(([k, p]) => [k, { st: +p.pitch.toFixed(2), bright: +p.bright.toFixed(2) }])),
    fail: { words: failWords, register: failRegister, heavy: failHeavy },
  };
  writeFileSync(join(b, 'voicecheck.json'), JSON.stringify(res, null, 1));
  console.log(`${s} voice check: words ${failWords.length ? `FIX ${failWords.join(' ')}` : 'pass'} · register ${failRegister.length ? `FIX ${register.map((r) => `${r.id} ${r.dSt.toFixed(1)}st ${r.dDb.toFixed(1)}dB`).join(', ')}` : 'pass'} · heavy ${failHeavy.length ? `FIX ${failHeavy.map((id) => `${id} ${JSON.stringify(heavy[id])}`).join(', ')}` : 'pass'}`);
  return !failWords.length && !failRegister.length && !failHeavy.length;
}

// --- render ----------------------------------------------------------------

const stateKey = (st) => `${st.slide}|${[...st.show].sort().join(',')}|${st.focus ?? ''}|${st.caption ?? ''}`;

// Renders every distinct screen state to PNG. Returns {files: Map(key -> png), problems}.
async function renderStates(browser, script, states, { fmt, dir, shortTitle = '' }) {
  mkdirSync(dir, { recursive: true });
  const [w, h] = SIZES[fmt];
  const slides = { ...script.slides, end: { type: 'end', line: script.endLine || '' } };
  const files = new Map();
  const problems = [];
  const bySlide = new Map();
  for (const st of states) { if (!bySlide.has(st.slide)) bySlide.set(st.slide, []); bySlide.get(st.slide).push(st); }
  let n = 0;
  for (const [id, list] of bySlide) {
    const slide = slides[id];
    if (!slide) { problems.push(`no slide "${id}"`); continue; }
    const doc = slideHtml(slide, { fmt, lang: script.lang, chapter: slide.chapter || '', shortTitle });
    const colours = offBrandColours(doc);
    if (colours.length) problems.push(`${id}: off-brand colours ${colours.join(', ')}`);
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await page.setContent(doc, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    // Fully revealed: nothing may overflow, and the brand check must pass.
    const over = await layoutProblems(page);
    if (over.length) problems.push(`${id} (${fmt}): ${over.join(' | ')}`);
    const full = await page.screenshot();
    const brand = await brandProblems(page, full);
    if (brand.length) problems.push(`${id} (${fmt}): ${brand.join('; ')}`);
    for (const st of list) {
      const k = stateKey(st);
      if (files.has(k)) continue;
      await page.evaluate(applyState, { show: st.show, focus: st.focus ?? null, caption: st.caption ?? '' });
      const f = join(dir, `${String(n++).padStart(4, '0')}.png`);
      await page.screenshot({ path: f });
      files.set(k, f);
    }
    await page.close();
  }
  return { files, problems };
}

// Still frames on their timeline, cut on each change. Slides are still
// images, so keyframes come only at changes (long GOP): a long-form stays
// under UPLOAD_MAX, the size the Studio upload step can take, with sharp text.
const UPLOAD_MAX = 9_300_000;
function encode({ segs, files, audio, duration, out, tmp }) {
  const lines = [];
  for (const sg of segs) lines.push(`file '${files.get(stateKey(sg))}'`, `duration ${sg.dur.toFixed(5)}`);
  lines.push(`file '${files.get(stateKey(segs.at(-1)))}'`);
  const list = join(tmp, 'frames.txt');
  writeFileSync(list, lines.join('\n') + '\n');
  const vid = join(tmp, 'video-only.mp4');
  ff(['-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryslow', '-tune', 'stillimage',
    '-crf', '20', '-g', '9000', '-keyint_min', '1', '-an', '-t', duration.toFixed(3), vid]);
  // Audio gets what is left of the size budget: 96 to 192 kbps.
  const room = (UPLOAD_MAX - statSync(vid).size) * 8 / duration / 1000;
  const kbps = Math.max(96, Math.min(192, Math.floor(room / 16) * 16));
  ff(['-v', 'error', '-i', vid, '-i', audio, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', `${kbps}k`, '-ar', '48000', '-t', duration.toFixed(3), '-movflags', '+faststart', out]);
  rmSync(vid, { force: true });
}

const ytMusic = (m) => ({ title: m.title, artist: m.artist, licence: m.licence });

async function renderLong(browser, ep, script, takes) {
  const { b, o } = dirs(ep.slug);
  const tl = longForm(script, takes);
  const frames = join(b, 'frames');
  rmSync(frames, { recursive: true, force: true });
  const { files, problems } = await renderStates(browser, script, tl.states, { fmt: 'landscape', dir: frames });
  if (problems.length) throw new Error(`slides: ${problems.join(' ; ')}`);
  const narration = join(b, 'narration.wav');
  layNarration(tl.placed.beats.map((p) => ({ file: takes[p.id].file, t: p.t0 })), tl.duration, narration);
  const mix = mixVideo({ slug: ep.slug, narration, duration: tl.duration, speech: tl.placed.beats.map((p) => [p.t0, p.t1]), out: join(b, 'mix.wav') });
  const segs = segments(tl.states, tl.duration);
  encode({ segs, files, audio: join(b, 'mix.wav'), duration: tl.duration, out: join(b, 'video.mp4'), tmp: frames });
  writeFileSync(join(o, 'captions.ar.srt'), toSrt(tl.cues));
  writeFileSync(join(b, 'render.json'), JSON.stringify({ at: new Date().toISOString(), duration: tl.duration, speechEnd: tl.speechEnd, chapters: tl.chapters, mix, problems: tl.problems, segs: segs.map((x) => ({ t: x.t, dur: x.dur, slide: x.slide, key: stateKey(x), file: files.get(stateKey(x)), beat: x.beat })), beats: tl.placed.beats.map(({ id, t0, t1 }) => ({ id, t0, t1 })) }, null, 1));
  console.log(`${ep.slug}: ${stamp(tl.duration)} video, ${segs.length} screen states, ${tl.chapters.length} chapters, ${tl.cues.length} captions; ${mix.I} LUFS, bed "${mix.title}"`);
  return { tl, mix };
}

async function renderShort(browser, ep, parent, script, takes) {
  const { b, o } = dirs(ep.slug);
  const sf = shortForm(script, takes, ep.beats);
  // Screen changes and caption changes on one timeline.
  const cuts = [...new Set([0, ...sf.states.map((s) => s.t), ...sf.cues.flatMap((c) => [c.start, c.end])])].filter((t) => t < sf.duration).sort((p, q) => p - q);
  const states = cuts.map((t) => {
    const st = [...sf.states].reverse().find((s) => s.t <= t + 1e-6) || sf.states[0];
    const cue = sf.cues.find((c) => c.start <= t + 1e-6 && c.end > t + 1e-6);
    return { ...st, t, caption: cue ? cue.text : '' };
  }).filter((s, i, a) => !i || stateKey(s) !== stateKey(a[i - 1]));
  const frames = join(b, 'frames');
  rmSync(frames, { recursive: true, force: true });
  const { files, problems } = await renderStates(browser, script, states, { fmt: 'portrait', dir: frames, shortTitle: ep.screenTitle });
  if (problems.length) throw new Error(`slides: ${problems.join(' ; ')}`);
  const narration = join(b, 'narration.wav');
  layNarration(sf.placed.beats.map((p) => ({ file: takes[p.id].file, t: p.t0 })), sf.duration, narration);
  const mix = mixVideo({ slug: ep.slug, narration, duration: sf.duration, speech: sf.placed.beats.map((p) => [p.t0, p.t1]), out: join(b, 'mix.wav') });
  const segs = segments(states, sf.duration);
  encode({ segs, files, audio: join(b, 'mix.wav'), duration: sf.duration, out: join(b, 'video.mp4'), tmp: frames });
  writeFileSync(join(o, 'captions.ar.srt'), toSrt(sf.cues));
  writeFileSync(join(b, 'render.json'), JSON.stringify({ at: new Date().toISOString(), duration: sf.duration, mix, problems: sf.problems, segs: segs.map((x) => ({ t: x.t, dur: x.dur, slide: x.slide, key: stateKey(x), file: files.get(stateKey(x)) })), beats: sf.placed.beats.map(({ id, t0, t1 }) => ({ id, t0, t1 })) }, null, 1));
  console.log(`${ep.slug}: ${sf.duration.toFixed(1)} s Short, ${segs.length} frames states, ${sf.cues.length} captions; ${mix.I} LUFS`);
  return { sf, mix };
}

async function renderThumb(browser, ep) {
  const { o } = dirs(ep.slug);
  const doc = thumbnailHtml(ep.thumbnail, { lang: ep.lang });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await page.setContent(doc, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot();
  const problems = [...offBrandColours(doc).map((c) => `off-brand colour ${c}`), ...await brandProblems(page, png)];
  await page.close();
  if (problems.length) throw new Error(`thumbnail: ${problems.join('; ')}`);
  writeFileSync(join(o, 'thumbnail.png'), png);
}

function metadata(ep, { duration, chapters = null, mix, parentId = null }) {
  const { o } = dirs(ep.slug);
  const playlist = reg.playlists[ep.playlist];
  const credits = readJson(join(BUILD, ep.parent || ep.slug, 'credits-total.json'), null);
  const m = {
    slug: ep.slug, kind: ep.kind, title: ep.title,
    description: composeDescription(ep, { chapters, parentId, music: ytMusic(mix) }),
    tags: ep.tags, playlist: { key: ep.playlist, title: playlist.title }, publishAt: ep.publishAt, timezone: reg.timezone,
    category: 'Education', language: ep.lang, madeForKids: false, duration: +duration.toFixed(2), chapters,
    captions: 'captions.ar.srt', thumbnail: ep.kind === 'long' ? 'thumbnail.png' : null,
    video: `social/youtube/build/${ep.slug}/video.mp4`, music: ytMusic(mix), voiceCredits: credits,
  };
  writeFileSync(join(o, 'metadata.json'), JSON.stringify(m, null, 2) + '\n');
  return m;
}

function creditsTotal(s) {
  const f = join(BUILD, 'credits.jsonl');
  const rows = existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.slug === s) : [];
  const total = { chars: rows.reduce((n, r) => n + r.chars, 0), takes: rows.length };
  writeFileSync(join(BUILD, s, 'credits-total.json'), JSON.stringify(total));
  return total;
}

async function render(s) {
  const ep = episode(s);
  if (ep.kind !== 'long') die(`${s} is a Short; render its long-form ${ep.parent}`);
  const script = loadScript(ep);
  const takes = readJson(join(BUILD, s, 'takes.json')) || die(`${s}: run check first (it cuts the clips)`);
  creditsTotal(s);
  const browser = await chromium.launch();
  try {
    const { tl, mix } = await renderLong(browser, ep, script, takes);
    await renderThumb(browser, ep);
    metadata(ep, { duration: tl.duration, chapters: tl.chapters, mix });
    for (const sh of shortsOf(s)) {
      const { sf, mix: m2 } = await renderShort(browser, sh, ep, script, takes);
      metadata(sh, { duration: sf.duration, mix: m2, parentId: ep.youtube?.id || null });
    }
  } finally {
    await browser.close();
  }
}

// --- gate ------------------------------------------------------------------

// Mean absolute difference (0-255) between a video frame at t and a PNG, both at 192x108 grey.
function frameDiff(video, t, png, [w, h]) {
  const g = (args) => spawnSync('ffmpeg', ['-v', 'error', ...args, '-vf', `scale=${w / 10}:${h / 10},format=gray`, '-frames:v', '1', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 24 }).stdout;
  const a = g(['-ss', t.toFixed(3), '-i', video]), b = g(['-i', png]);
  if (!a?.length || a.length !== b.length) return 255;
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
  return d / a.length;
}

// The picture follows the voice: just after each sampled change the frame is
// the new state, not the old one.
function syncProblems(video, segsInfo, size) {
  const out = [];
  const changes = segsInfo.map((sg, i) => ({ sg, prev: segsInfo[i - 1] })).filter(({ sg, prev }) => prev && prev.file !== sg.file && sg.dur > 0.6);
  const step = Math.max(1, Math.floor(changes.length / 14));
  let worst = 0;
  for (const { sg, prev } of changes.filter((_, i) => i % step === 0)) {
    const t = sg.t + (prev.slide !== sg.slide ? 0.45 : 0.1);
    const now = frameDiff(video, t, sg.file, size), old = frameDiff(video, t, prev.file, size);
    if (!(now < old || now < 2)) { out.push(`at ${stamp(sg.t)} (${sg.slide}) the picture still shows the previous state (diff new ${now.toFixed(1)} vs old ${old.toFixed(1)})`); worst = Math.max(worst, now); }
  }
  return { problems: out, checked: Math.ceil(changes.length / step) };
}

function gateOne(ep, { script, isShort }) {
  const b = join(BUILD, ep.slug), o = join(OUT, ep.slug);
  const fails = [], notes = [];
  const r = readJson(join(b, 'render.json'));
  if (!r) return { fails: ['not rendered'], notes };
  const video = join(b, 'video.mp4');
  const p = probe(video);
  const v = p.streams.find((s) => s.codec_type === 'video');
  const [W, H] = isShort ? [1080, 1920] : [1920, 1080];
  if (!v || v.width !== W || v.height !== H) fails.push(`video is ${v?.width}x${v?.height}, expected ${W}x${H}`);
  if (statSync(video).size > 9_800_000) fails.push(`video is ${(statSync(video).size / 1e6).toFixed(2)} MB; the Studio upload step takes under 10 MB`);
  // Words and tone of every take in this video.
  const vc = readJson(join(BUILD, ep.parent || ep.slug, 'voicecheck.json'));
  const ids = r.beats.map((x) => x.id);
  if (!vc) fails.push('no voice check');
  else {
    const accepted = script.accept || {};
    const w = ids.filter((id) => !vc.words[id]?.ok && !accepted[id]?.words);
    const t = ids.filter((id) => (vc.fail.register.includes(id) || vc.fail.heavy.includes(id)));
    if (w.length) fails.push(`words: ${w.map((id) => `${id} ${(vc.words[id].score * 100).toFixed(0)}% (missing ${vc.words[id].missed.slice(0, 5).join(' ')})`).join('; ')}`);
    if (t.length) fails.push(`tone: ${t.join(' ')} off-register or heavy`);
    const acc = ids.filter((id) => accepted[id]);
    notes.push(`words: ${ids.length - w.length} of ${ids.length} takes heard as written (≥85%)${acc.length ? `; accepted by ear: ${acc.map((id) => `${id} (${accepted[id].why})`).join(', ')}` : ''}`);
    notes.push(`tone: ${t.length ? `${t.length} takes flagged` : 'every take in register (±3 st, ≤4 dB darker), no held heavy stretch'}`);
  }
  // Timeline and sync.
  if (r.problems?.length) fails.push(`timeline: ${r.problems.join('; ')}`);
  const short = r.segs.filter((sg, i) => sg.dur < MIN_STATE - 0.01 && i < r.segs.length - 1 && !isShort);
  if (short.length) fails.push(`${short.length} screen states shorter than ${MIN_STATE} s`);
  const speechSegs = r.segs.filter((sg) => sg.slide !== 'end');
  const still = isShort ? 0 : Math.max(...speechSegs.map((sg) => sg.dur));
  if (still > 16) fails.push(`the screen holds still for ${still.toFixed(1)} s while the voice talks (max 16)`);
  const sync = syncProblems(video, r.segs, [W, H]);
  if (sync.problems.length) fails.push(...sync.problems);
  notes.push(`sync: ${sync.checked} screen changes sampled, picture on the new state at each; longest still screen ${still.toFixed(1)} s`);
  // Sound.
  const sound = soundProblems(video, r.mix, { duration: r.duration, endCard: isShort ? 0 : END_CARD });
  fails.push(...sound);
  notes.push(`sound: ${r.mix.I} LUFS, true peak ${r.mix.TP} dBTP, music "${r.mix.title}" (${r.mix.licence}) ${r.mix.bedUnderSpeech != null ? `${(r.mix.voiceLevel - r.mix.bedUnderSpeech).toFixed(0)} LU under the voice` : ''}`);
  // Captions.
  const srt = existsSync(join(o, 'captions.ar.srt')) ? readFileSync(join(o, 'captions.ar.srt'), 'utf8') : '';
  const cues = srt.trim().split(/\n\n+/).filter(Boolean).map((blk) => {
    const [, time, ...text] = blk.split('\n');
    const [a, z] = time.split(' --> ').map((x) => { const [h, m, s] = x.replace(',', '.').split(':'); return +h * 3600 + +m * 60 + +s; });
    return { start: a, end: z, text: text.join('\n') };
  });
  if (!cues.length) fails.push('no captions');
  fails.push(...cueProblems(cues, r.duration).map((m) => `captions: ${m}`));
  const uncovered = r.beats.filter((bt) => !cues.some((c) => c.start >= bt.t0 - 0.05 && c.start <= bt.t1));
  if (uncovered.length) fails.push(`captions: no cue for ${uncovered.map((x) => x.id).join(' ')}`);
  notes.push(`captions: ${cues.length} cues, every beat covered, none over two lines`);
  // Chapters, thumbnail, metadata.
  const meta = readJson(join(o, 'metadata.json'));
  if (!meta) fails.push('no metadata.json');
  if (!isShort) {
    const ch = chapterProblems(r.chapters, r.duration);
    fails.push(...ch.map((m) => `chapters: ${m}`));
    notes.push(`chapters: ${r.chapters.map((c) => `${stamp(c.t)} ${c.title}`).join(' · ')}`);
    const th = join(o, 'thumbnail.png');
    if (!existsSync(th)) fails.push('no thumbnail');
    else {
      const tp = probe(th).streams[0];
      if (tp.width !== 1280 || tp.height !== 720) fails.push(`thumbnail is ${tp.width}x${tp.height}`);
      if (statSync(th).size > 2 * 1024 * 1024) fails.push('thumbnail over 2 MB');
      notes.push(`thumbnail: 1280x720, ${(statSync(th).size / 1024).toFixed(0)} KB, brand check passed`);
    }
  }
  if (isShort && r.duration > 59.5) fails.push(`the Short runs ${r.duration.toFixed(1)} s`);
  const mp = episodeProblems(ep, reg, { chapters: isShort ? null : r.chapters, duration: r.duration, music: r.mix });
  fails.push(...mp.map((m) => `metadata: ${m}`));
  notes.push(`metadata: title ${ep.title.length} chars, ${ep.tags.length} tags, description links devya.dev${ep.project ? ` and ${ep.project}` : ''}, UTM-tagged`);
  return { fails, notes, duration: r.duration };
}

function gate(s) {
  const ep = episode(s);
  const script = loadScript(ep);
  const lines = [`# Review gate: ${ep.slug}`, '', `Run ${new Date().toISOString().slice(0, 16)}Z by \`node social/youtube/produce.mjs gate ${s}\`.`, ''];
  let ok = true;
  for (const [e, isShort] of [[ep, false], ...shortsOf(s).map((x) => [x, true])]) {
    const res = gateOne(e, { script, isShort });
    const pass = !res.fails.length;
    ok &&= pass;
    lines.push(`## ${isShort ? 'Short' : 'Long-form'} \`${e.slug}\`: ${pass ? 'PASS' : 'FIX'}`, '', `- ${e.title}`, `- ${res.duration ? stamp(res.duration) : '?'} · publish ${e.publishAt} Cairo`, ...res.notes.map((n) => `- ${n}`), ...(pass ? [] : ['', '**To fix:**', ...res.fails.map((f) => `- ${f}`)]), '');
    console.log(`${e.slug}: ${pass ? 'PASS' : `FIX: ${res.fails.join(' ; ')}`}`);
  }
  writeFileSync(join(OUT, s, 'review.md'), lines.join('\n'));
  return ok;
}

// --- misc ------------------------------------------------------------------

// Rewrites metadata.json for a long-form and its Shorts from their render
// (after an upload gives the long-form its id, the Shorts link it).
function meta(s) {
  const ep = episode(s);
  for (const e of [ep, ...shortsOf(s)]) {
    const r = readJson(join(BUILD, e.slug, 'render.json')) || die(`${e.slug}: not rendered`);
    metadata(e, { duration: r.duration, chapters: e.kind === 'long' ? r.chapters : null, mix: r.mix, parentId: e.kind === 'short' ? ep.youtube?.id || null : null });
    console.log(`${e.slug}: metadata.json written`);
  }
}

async function quota() {
  const sub = await subscription(apiKey());
  console.log(`ElevenLabs (Devya Solutions): plan ${sub.tier}, ${sub.used.toLocaleString()} of ${sub.limit.toLocaleString()} credits used, ${(sub.limit - sub.used).toLocaleString()} left, resets ${sub.resets}`);
}

function status() {
  for (const e of reg.episodes) {
    const o = join(OUT, e.slug);
    const rf = join(OUT, e.parent || e.slug, 'review.md');
    const review = existsSync(rf) ? (readFileSync(rf, 'utf8').match(new RegExp(`\`${e.slug}\`: (PASS|FIX)`)) || [])[1] || '-' : '-';
    console.log(`${e.publishAt}  ${e.kind.padEnd(5)}  ${e.slug.padEnd(34)} gate ${review.padEnd(4)}  ${e.youtube?.id ? `youtube ${e.youtube.id} (${e.youtube.status})` : 'not uploaded'}`);
  }
}

async function main() {
  switch (cmd) {
    case 'quota': return quota();
    case 'narrate': return narrate(slug);
    case 'check': if (!check(slug)) process.exit(1); return;
    case 'render': return render(slug);
    case 'gate': if (!gate(slug)) process.exit(1); return;
    case 'all':
      await narrate(slug);
      if (!check(slug)) process.exit(1);
      await render(slug);
      if (!gate(slug)) process.exit(1);
      return;
    case 'status': return status();
    case 'meta': return meta(slug);
    default: die(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 20).join('\n'));
  }
}

main().catch((e) => {
  if (e instanceof QuotaExceeded) die(e.message, 8);
  die(e.stack || String(e));
});

