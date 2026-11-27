#!/usr/bin/env node
// Renders each calendar day's vertical video (1080x1920, 10 s, 30 fps, H.264 +
// AAC) in English and Arabic: the day's card, animated, over a licensed music
// bed (audio.mjs, social/music/). Used as that day's Facebook/Instagram Reel and
// Story and the LinkedIn video (the network's language picks the file). Frames
// are captured deterministically by stepping the page's CSS animations, then
// encoded with ffmpeg.
//
//   node render-reel.mjs                       render missing or stale reels for every day
//   node render-reel.mjs --date 2026-11-15 [--lang en|ar] [--force]
//
// Output in social/visuals/<date>/ (git-ignored; the routine renders the day's
// reels before publishing): reel-<lang>.mp4, reel-<lang>-cover.jpg,
// reel-<lang>.srt (subtitles, captions.mjs) and reel-<lang>.json (the recipe
// stamp: a reel whose template, card text, music or narration changed is
// rendered again, so an old silent or off-brand video is never reused).
// Optional narration: visuals/<date>/voice-<lang>.{wav,mp3,m4a} (+ .srt script);
// the music is ducked under it.
//
// Exits 4 if the product screenshot is refused (see shot-guard.mjs), 5 if the
// video fails the brand check (logo, theme) or the audio check (duration,
// -14 LUFS, true peak, music audible), 1 on any other error. In all three the
// old video is already deleted and nothing new is written. Exits 3 when the
// video was written but text overflowed the safe area (a warning).

import { chromium } from 'playwright-core';
import { readFileSync, existsSync, mkdirSync, rmSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { FONTS, THEME_CSS, esc, rich, highlight, shoot, fail } from './render.mjs';
import { logoImg, offBrandColours, LOGO_SHA256 } from './brand.mjs';
import { BrandCheckFailed, logoProblems, logoContrastProblems, themePixelProblems } from './brand-check.mjs';
import { mixReelAudio, verifyReelAudio, pickBed } from './audio.mjs';
import { reelCues, toSrt } from './captions.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOCIAL = join(HERE, '..');
export const W = 1080, H = 1920, FPS = 30, SECONDS = 10;
const CUT_LABEL = { en: 'v1 cut line', ar: 'خط الإصدار الأول' };
// Bump when the video recipe changes in a way the html/music hash cannot see.
const RECIPE_VERSION = 'reel-v2-music-silver';
// Moments the brand check looks at: the card fully built, and the end card.
const CHECK_AT = { card: 6.0, end: 9.6 };
const PIXEL_CHECK_AT = [1.2, 3.5, 6.0, 8.0, 9.6];

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const force = args.includes('--force');

// Title split into words that rise in one after another; *x* stays accent.
function words(title, t0) {
  let acc = false;
  return title.split(/\s+/).map((w, i) => {
    let inner = '';
    w.split('*').forEach((part, j) => { if (j > 0) acc = !acc; if (part) inner += acc ? `<em>${esc(part)}</em>` : esc(part); });
    return `<span class="w" style="animation-delay:${(t0 + i * 0.07).toFixed(2)}s">${inner}</span>`;
  }).join(' ');
}
const at = (t) => `style="animation-delay:${t.toFixed(2)}s"`;

function stage(day, t, lang, start) {
  const c = day.card;
  let k = start;
  switch (day.layout) {
    case 'checklist':
      return `<ol class="list">${t.items.map((it, i) => {
        const cut = c.cut && i === c.cut ? `<li class="cut in" ${at(k + 0.1)}><span>${CUT_LABEL[lang]}</span></li>` : '';
        const later = c.cut && i >= c.cut ? ' later' : '';
        return `${cut}<li class="item in${later}" ${at((k += 0.42))}><b>${String(i + 1).padStart(2, '0')}</b><span>${rich(it)}</span></li>`;
      }).join('')}</ol>`;
    case 'code':
      return c.code.map((b) => {
        const label = b.label && typeof b.label === 'object' ? b.label[lang] : b.label;
        const lines = highlight(b.code).split('\n').map((l) => `<div class="cl in" ${at((k += 0.13))}>${l || '&nbsp;'}</div>`).join('');
        return `<div class="win in" ${at(start)}>${label ? `<div class="wl" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">${esc(label)}</div>` : ''}<pre dir="ltr">${lines}</pre></div>`;
      }).join('');
    case 'terminal': {
      const lines = c.terminal.map((l) => {
        let cls = 'out';
        let body = esc(l);
        if (l.startsWith('$ ')) { cls = 'cmd'; body = `<span class="p">$</span> ${esc(l.slice(2))}`; }
        else if (/^(✗|error|ERROR|FAIL)/.test(l)) cls = 'bad';
        else if (/^(✓|ok|PASS)/.test(l)) cls = 'ok';
        return `<div class="in ${cls}" ${at((k += 0.55))}>${body}</div>`;
      }).join('');
      return `<div class="win term in" dir="ltr" ${at(start)}><div class="bar"><i></i><i></i><i></i></div><div class="tl">${lines}</div></div>`;
    }
    case 'compare':
      return `<div class="cmp"><div class="col no in" ${at(k)}><h4>${esc(t.left.label)}</h4><ul>${t.left.items.map((x) => `<li class="in" ${at((k += 0.3))}>${rich(x)}</li>`).join('')}</ul></div><div class="col yes in" ${at((k += 0.3))}><h4>${esc(t.right.label)}</h4><ul>${t.right.items.map((x) => `<li class="in" ${at((k += 0.3))}>${rich(x)}</li>`).join('')}</ul></div></div>`;
    case 'product':
      return `<div class="frame in" ${at(k)}><div class="bar" dir="ltr"><i></i><i></i><i></i><span>${esc(c.shotLabel || c.shot.replace(/^https?:\/\/(www\.)?/, ''))}</span></div><div class="shot"><img src="data:image/png;base64,${day._shot}"></div></div>${t.items ? `<div class="chips">${t.items.map((x) => `<span class="in" ${at((k += 0.35))}>${rich(x)}</span>`).join('')}</div>` : ''}`;
    default:
      return '';
  }
}

export function html(day, lang) {
  const t = day.card[lang];
  const rtl = lang === 'ar';
  const statement = day.layout === 'statement';
  const titleWords = t.title.split(/\s+/).length;
  const bodyStart = 0.9 + titleWords * 0.07 + 0.5;
  return `<!doctype html><html lang="${lang}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><style>
${FONTS}
*{box-sizing:border-box;margin:0;padding:0}
${THEME_CSS}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:var(--bg)}
body{color:var(--fg);font-family:${rtl ? 'Cairo' : 'Sora'},sans-serif;position:relative}
.bg{position:absolute;inset:-20%;background:radial-gradient(circle at 70% 25%,var(--glow),transparent 45%),radial-gradient(circle at 20% 85%,var(--glow2),transparent 40%);animation:drift ${SECONDS}s linear both}
.dots{position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.05) 1.6px,transparent 1.9px);background-size:32px 32px}
@keyframes drift{from{transform:translate(0,0) scale(1)}to{transform:translate(-4%,3%) scale(1.08)}}
@keyframes up{from{opacity:0;transform:translateY(34px)}to{opacity:1;transform:none}}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes out{from{opacity:1;transform:none}to{opacity:0;transform:translateY(-40px)}}
@keyframes pop{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:none}}
/* Safe area: clear of the Reels/Stories header (top), caption and buttons (bottom) and action rail (right). */
.main{position:absolute;left:84px;right:${rtl ? 84 : 150}px;top:250px;bottom:430px;${rtl ? 'right:84px;left:150px;' : ''}display:flex;flex-direction:column;justify-content:center;animation:out .5s ease-in both;animation-delay:${SECONDS - 2.3}s}
.main .logo{display:block;align-self:${rtl ? 'flex-end' : 'flex-start'};margin-bottom:60px;animation:fade .5s both}
.pill{align-self:flex-start;color:var(--silver);background:rgba(214,220,228,.08);border:1px solid rgba(214,220,228,.24);border-radius:999px;padding:12px 28px;font-weight:700;font-size:${rtl ? 30 : 25}px;${rtl ? '' : 'letter-spacing:.14em;text-transform:uppercase;'}margin-bottom:34px;animation:up .5s .35s both}
h1{font-weight:${rtl ? 800 : 700};letter-spacing:${rtl ? 0 : '-.02em'};line-height:${rtl ? 1.36 : 1.06};font-size:${statement ? (rtl ? 96 : 108) : (rtl ? 72 : 80)}px;color:var(--fg)}
.w{display:inline-block;animation:up .55s cubic-bezier(.2,.7,.2,1) both}
.sub{color:var(--fg2);font-size:36px;line-height:${rtl ? 1.65 : 1.42};margin-top:34px;animation:up .6s both;animation-delay:${bodyStart.toFixed(2)}s}
.stage{margin-top:52px;display:flex;flex-direction:column;gap:24px}
.in{animation:up .5s cubic-bezier(.2,.7,.2,1) both}
.list{list-style:none}
.item{display:flex;gap:28px;align-items:baseline;padding:22px 0;border-bottom:1px solid var(--line);font-size:${rtl ? 38 : 37}px;line-height:${rtl ? 1.5 : 1.32}}
.item b{font-family:JBMono;color:var(--silver);font-size:.8em;font-weight:600;min-width:1.9em}
.item.later{opacity:.42}.item.later.in{animation-name:upfaded}
@keyframes upfaded{from{opacity:0;transform:translateY(34px)}to{opacity:.42;transform:none}}
.cut{position:relative;height:56px;border-top:3px dashed var(--silver-dim);margin-top:12px;list-style:none}
.cut span{position:absolute;top:-.85em;${rtl ? 'left' : 'right'}:0;background:var(--bg);color:var(--silver);padding:0 12px;font-family:${rtl ? 'Cairo' : 'JBMono'};font-weight:700;font-size:26px}
.win{background:var(--bg2);border:1px solid var(--line);border-radius:24px;padding:28px 30px;direction:ltr;text-align:left}
.wl{font-family:JBMono;color:var(--silver);font-size:21px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;margin-bottom:12px}
.wl[dir=rtl]{text-align:right;letter-spacing:0;font-family:Cairo;font-size:26px}
pre{font-family:JBMono;font-size:25px;line-height:1.55;color:var(--fg2);white-space:pre-wrap}
.bar{display:flex;gap:10px;align-items:center;margin-bottom:18px}.bar i{width:15px;height:15px;border-radius:50%;background:var(--line2)}
.bar span{font-family:JBMono;color:var(--muted);font-size:21px;margin-left:10px}
.tl{font-family:JBMono;font-size:26px;line-height:1.6;color:var(--fg2)}
.cmp{display:grid;grid-template-columns:1fr;gap:22px}
.col{border-radius:24px;padding:26px 30px;border:1px solid var(--line);background:rgba(255,255,255,.02)}
.col.yes{border-color:rgba(214,220,228,.45);background:rgba(214,220,228,.05)}
.col h4{font-size:${rtl ? 30 : 24}px;font-weight:700;${rtl ? '' : 'letter-spacing:.12em;text-transform:uppercase;'}color:var(--muted);margin-bottom:14px}.col.yes h4{color:var(--silver)}
.col ul{list-style:none;display:flex;flex-direction:column;gap:12px}
.col li{font-size:${rtl ? 32 : 30}px;line-height:1.35;padding-${rtl ? 'right' : 'left'}:1.2em;position:relative}
.col li::before{position:absolute;${rtl ? 'right' : 'left'}:0;content:'×';color:var(--muted)}.col.yes li::before{content:'✓';color:var(--silver)}.col.no li{color:var(--muted)}
.frame{background:var(--bg2);border:1px solid var(--line);border-radius:24px;padding:16px;overflow:hidden}
.frame .bar{margin-bottom:14px;padding:0 6px}
.shot{height:440px;overflow:hidden;border-radius:14px}
.shot img{display:block;width:100%;filter:grayscale(1) contrast(1.04);animation:pan ${SECONDS}s ease-in-out both}
@keyframes pan{0%,25%{transform:translateY(0)}100%{transform:translateY(-10%)}}
.chips{display:flex;flex-wrap:wrap;gap:14px}
.chips span{border:1px solid var(--line);border-radius:999px;padding:12px 22px;font-size:${rtl ? 30 : 27}px;color:var(--fg2)}
.end{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;animation:pop .6s cubic-bezier(.2,.7,.2,1) both;animation-delay:${SECONDS - 1.9}s;direction:ltr}
.end .logo{display:block;margin-bottom:96px}
.end .url{font-family:Sora;font-weight:700;font-size:60px;color:var(--silver);margin-bottom:22px}
.end .h{font-family:Sora;font-size:36px;color:var(--muted)}
</style></head><body>
<div class="bg"></div><div class="dots"></div>
<div class="main">
  ${logoImg(LOGO_WIDTH.reel)}
  <div class="pill">${esc(t.kicker)}</div>
  <h1${/[\u0600-\u06FF]/.test(t.title) ? '' : ` dir="ltr" style="text-align:${rtl ? 'right' : 'left'}"`}>${words(t.title, 0.9)}</h1>
  ${t.sub && (statement || day.layout === 'product') ? `<p class="sub">${rich(t.sub)}</p>` : ''}
  ${statement ? '' : `<div class="stage">${stage(day, t, lang, bodyStart + (day.layout === 'product' && t.sub ? 0.4 : 0))}</div>`}
</div>
<div class="end">${logoImg(LOGO_WIDTH.end)}<div class="url">devya.dev</div><div class="h">@devyasoftware</div></div>
</body></html>`;
}

// Logo widths: in the card (~39 px tall) and on the end card (~74 px tall).
const LOGO_WIDTH = { reel: 330, end: 620 };

const sha = (s) => createHash('sha256').update(s).digest('hex');

// Optional narration for a day and language: visuals/<date>/voice-<lang>.{wav,mp3,m4a}.
export function narrationFor(dir, lang) {
  for (const ext of ['wav', 'mp3', 'm4a']) {
    const p = join(dir, `voice-${lang}.${ext}`);
    if (existsSync(p)) return p;
  }
  return null;
}

// Everything that shapes the finished video (template, card text, logo, the
// mixer and caption code, the music file and window, narration and its
// script); a changed hash means re-render.
const CODE = ['audio.mjs', 'captions.mjs', 'brand.mjs'].map((f) => readFileSync(join(HERE, f), 'utf8')).join('\n');
export function recipeHash(day, lang, narration) {
  const bed = pickBed(day.date);
  const script = narration ? narration.replace(/\.\w+$/, '.srt') : null;
  return sha([RECIPE_VERSION, LOGO_SHA256, CODE, html(day, lang), bed.track.sha256, bed.start,
    narration ? sha(readFileSync(narration)) : 'no-voice', script && existsSync(script) ? sha(readFileSync(script)) : 'no-script'].join('\n'));
}

const seek = (page, s) => page.evaluate((ms) => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = ms; }), s * 1000);

// Brand problems in the animated card at the moments that matter.
export async function reelBrandProblems(page, doc) {
  const colours = offBrandColours(doc);
  const problems = colours.length ? [`off-brand colours in the template: ${colours.join(', ')}`] : [];
  for (const [name, s] of Object.entries(CHECK_AT)) {
    await seek(page, s);
    problems.push(...[...await logoProblems(page), ...await logoContrastProblems(page)].map((p) => `${name} at ${s}s: ${p}`));
  }
  for (const s of PIXEL_CHECK_AT) {
    await seek(page, s);
    problems.push(...(await themePixelProblems(page, await page.screenshot())).map((p) => `at ${s}s: ${p}`));
  }
  return problems;
}

export async function renderReel(browser, day, lang, out, { narration = null } = {}) {
  const doc = html(day, lang);
  const work = mkdtempSync(join(tmpdir(), 'devya-reel-'));
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  try {
    await page.setContent(doc, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const over = await page.evaluate(() => {
      document.getAnimations().forEach((a) => { a.pause(); a.currentTime = 7000; });
      const m = document.querySelector('.main');
      const box = m.getBoundingClientRect();
      const deepest = Math.max(...[...m.querySelectorAll('*')].map((e) => e.getBoundingClientRect().bottom));
      return deepest > box.bottom + 2;
    });
    if (over) console.error(`OVERFLOW reel ${day.date} ${lang}`);
    const problems = await reelBrandProblems(page, doc);
    if (problems.length) throw new BrandCheckFailed(`reel ${day.date} ${lang}`, problems);
    for (let f = 0; f < FPS * SECONDS; f++) {
      await seek(page, f / FPS);
      await page.screenshot({ path: join(work, `${String(f).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 92 });
    }
    const wav = join(work, 'mix.wav');
    const mix = mixReelAudio({ date: day.date, duration: SECONDS, out: wav, narration });
    const tmpOut = join(work, 'reel.mp4');
    const ff = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(work, '%04d.jpg'), '-i', wav,
      '-map', '0:v', '-map', '1:a', '-t', String(SECONDS),
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', String(FPS),
      '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', tmpOut], { stdio: 'inherit' });
    if (ff.status !== 0) throw new Error(`ffmpeg failed for ${out}`);
    const audioProblems = verifyReelAudio(tmpOut, { duration: SECONDS });
    if (audioProblems.length) throw new BrandCheckFailed(`reel ${day.date} ${lang} audio`, audioProblems);
    // Cover frame (the full card, before the end card) for Reel covers and the LinkedIn video thumbnail.
    const cover = join(work, 'cover.jpg');
    const cv = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '7.0', '-i', tmpOut, '-frames:v', '1', '-q:v', '2', cover], { stdio: 'inherit' });
    if (cv.status !== 0 || !existsSync(cover)) throw new Error(`cover frame failed for ${out}`);
    const script = narration && existsSync(narration.replace(/\.\w+$/, '.srt')) ? readFileSync(narration.replace(/\.\w+$/, '.srt'), 'utf8') : toSrt(reelCues(day, lang, SECONDS));
    writeFileSync(out, readFileSync(tmpOut));
    writeFileSync(out.replace(/\.mp4$/, '-cover.jpg'), readFileSync(cover));
    writeFileSync(out.replace(/\.mp4$/, '.srt'), script);
    const m = verifyStats(out);
    writeFileSync(out.replace(/\.mp4$/, '.json'), JSON.stringify({ recipe: recipeHash(day, lang, narration), music: { id: mix.track, title: mix.title, artist: mix.artist, licence: mix.licence, start: mix.start }, narration: !!narration, loudness: m, bedUnderSpeech: mix.bedUnderSpeech }, null, 2) + '\n');
    return { ok: !over, mix, loudness: m };
  } finally {
    await page.close();
    rmSync(work, { recursive: true, force: true });
  }
}

// Loudness summary of the written file for the stamp.
function verifyStats(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-map', '0:a:0', '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' });
  const sum = r.stderr.slice(r.stderr.lastIndexOf('Summary:'));
  const num = (re) => parseFloat((sum.match(re) || [])[1]);
  return { I: num(/I:\s+(-?[\d.]+) LUFS/), TP: num(/Peak:\s+(-?[\d.]+) dBFS/) };
}

async function main() {
  const cal = JSON.parse(readFileSync(join(SOCIAL, 'calendar.json'), 'utf8'));
  let days = cal.days;
  if (opt('--date')) days = days.filter((d) => d.date === opt('--date'));
  const langs = opt('--lang') ? [opt('--lang')] : ['en', 'ar'];
  const browser = await chromium.launch();
  let bad = 0;
  for (const day of days) {
    const dir = join(SOCIAL, 'visuals', day.date);
    mkdirSync(dir, { recursive: true });
    for (const lang of langs) {
      const out = join(dir, `reel-${lang}.mp4`);
      const stampPath = out.replace(/\.mp4$/, '.json');
      if (!force && existsSync(out) && !existsSync(stampPath)) console.log(`stale ${day.date} reel-${lang}.mp4 (no recipe stamp: made before music/brand checks); re-rendering`);
      if (day.layout === 'product' && !day._shot) {
        const shot = join(dir, 'shot.png');
        if (!existsSync(shot)) await shoot(browser, day.card.shot, shot);
        day._shot = readFileSync(shot).toString('base64');
      }
      const narration = narrationFor(dir, lang);
      if (!force && existsSync(out) && existsSync(stampPath)) {
        let stamp = {};
        try { stamp = JSON.parse(readFileSync(stampPath, 'utf8')); } catch { /* unreadable stamp: re-render */ }
        if (stamp.recipe === recipeHash(day, lang, narration)) continue;
        console.log(`stale ${day.date} reel-${lang}.mp4 (card, music or template changed); re-rendering`);
      }
      // Remove the old video first: if this render fails, no stale or silent file is left to publish.
      for (const f of [out, stampPath, out.replace(/\.mp4$/, '-cover.jpg'), out.replace(/\.mp4$/, '.srt')]) rmSync(f, { force: true });
      const r = await renderReel(browser, day, lang, out, { narration });
      if (!r.ok) bad++;
      console.log(`rendered ${day.date} reel-${lang}.mp4 · music "${r.mix.title}" by ${r.mix.artist} (${r.mix.licence}) from ${r.mix.start}s · ${r.loudness.I} LUFS, ${r.loudness.TP} dBTP${r.mix.bedUnderSpeech != null ? ` · bed under speech ${r.mix.bedUnderSpeech} LUFS` : ''} · brand + audio checks passed`);
    }
  }
  await browser.close();
  // 3 = written, but text overflowed the safe area (a warning; the routine still publishes).
  if (bad) process.exit(3);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(fail);
