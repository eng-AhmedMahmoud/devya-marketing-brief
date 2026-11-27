#!/usr/bin/env node
// Renders each calendar day's vertical video (1080x1920, 10 s, 30 fps, H.264
// with a silent AAC track) in English and Arabic: the day's card, animated.
// Used as that day's Facebook/Instagram Reel and Story (the network's
// language picks the file). Frames are captured deterministically by
// stepping the page's CSS animations, then encoded with ffmpeg.
//
//   node render-reel.mjs                       render missing reels for every day
//   node render-reel.mjs --date 2026-11-15 [--lang en|ar] [--force]
//
// Output: social/visuals/<date>/reel-<lang>.mp4 + reel-<lang>-cover.jpg (git-ignored; the routine
// renders the day's reels before publishing, so they never need committing).
// Exits 4 if the product screenshot is refused (see shot-guard.mjs): no reel is made from it.

import { chromium } from 'playwright-core';
import { readFileSync, existsSync, mkdirSync, rmSync, mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { FONTS, ACCENT, esc, rich, highlight, shoot, fail } from './render.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOCIAL = join(HERE, '..');
const W = 1080, H = 1920, FPS = 30, SECONDS = 10;
const CUT_LABEL = { en: 'v1 cut line', ar: 'خط الإصدار الأول' };

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

function html(day, lang) {
  const t = day.card[lang];
  const rtl = lang === 'ar';
  const statement = day.layout === 'statement';
  const titleWords = t.title.split(/\s+/).length;
  const bodyStart = 0.9 + titleWords * 0.07 + 0.5;
  return `<!doctype html><html lang="${lang}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><style>
${FONTS}
*{box-sizing:border-box;margin:0;padding:0}
:root{--a:${ACCENT[day.accent]};--i9:#0F0F0F;--i8:#1A1A1A;--i7:#262626;--i4:#737373;--i3:#A3A3A3;--i1:#F5F5F5}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:var(--i9)}
body{color:var(--i1);font-family:${rtl ? 'Cairo' : 'Sora'},sans-serif;position:relative}
.bg{position:absolute;inset:-20%;background:radial-gradient(circle at 70% 25%,color-mix(in srgb,var(--a) 22%,transparent),transparent 45%),radial-gradient(circle at 20% 85%,color-mix(in srgb,var(--a) 12%,transparent),transparent 40%);animation:drift ${SECONDS}s linear both}
.dots{position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.05) 1.6px,transparent 1.9px);background-size:32px 32px}
@keyframes drift{from{transform:translate(0,0) scale(1)}to{transform:translate(-4%,3%) scale(1.08)}}
@keyframes up{from{opacity:0;transform:translateY(34px)}to{opacity:1;transform:none}}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes out{from{opacity:1;transform:none}to{opacity:0;transform:translateY(-40px)}}
@keyframes pop{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:none}}
em{font-style:normal;color:var(--a)}
/* Safe area: clear of the Reels/Stories header (top), caption and buttons (bottom) and action rail (right). */
.main{position:absolute;left:84px;right:${rtl ? 84 : 150}px;top:250px;bottom:430px;${rtl ? 'right:84px;left:150px;' : ''}display:flex;flex-direction:column;${statement ? 'justify-content:center;' : 'justify-content:center;'}animation:out .5s ease-in both;animation-delay:${SECONDS - 2.3}s}
.mark{font-family:JBMono;font-weight:600;font-size:40px;letter-spacing:.06em;direction:ltr;align-self:${rtl ? 'flex-end' : 'flex-start'};margin-bottom:44px;animation:fade .5s both}.mark span{color:var(--i4)}
.pill{align-self:flex-start;color:var(--a);background:color-mix(in srgb,var(--a) 13%,transparent);border:1px solid color-mix(in srgb,var(--a) 30%,transparent);border-radius:999px;padding:12px 28px;font-weight:700;font-size:${rtl ? 30 : 25}px;${rtl ? '' : 'letter-spacing:.14em;text-transform:uppercase;'}margin-bottom:34px;animation:up .5s .35s both}
h1{font-weight:${rtl ? 800 : 700};letter-spacing:${rtl ? 0 : '-.02em'};line-height:${rtl ? 1.36 : 1.06};font-size:${statement ? (rtl ? 96 : 108) : (rtl ? 72 : 80)}px}
.w{display:inline-block;animation:up .55s cubic-bezier(.2,.7,.2,1) both}
.sub{color:var(--i3);font-size:${rtl ? 36 : 36}px;line-height:${rtl ? 1.65 : 1.42};margin-top:34px;animation:up .6s both;animation-delay:${bodyStart.toFixed(2)}s}
.stage{margin-top:52px;display:flex;flex-direction:column;gap:24px}
.in{animation:up .5s cubic-bezier(.2,.7,.2,1) both}
.list{list-style:none}
.item{display:flex;gap:28px;align-items:baseline;padding:22px 0;border-bottom:1px solid var(--i8);font-size:${rtl ? 38 : 37}px;line-height:${rtl ? 1.5 : 1.32}}
.item b{font-family:JBMono;color:var(--a);font-size:.8em;font-weight:600;min-width:1.9em}
.item.later{opacity:.42}.item.later.in{animation-name:upfaded}
@keyframes upfaded{from{opacity:0;transform:translateY(34px)}to{opacity:.42;transform:none}}
.cut{position:relative;height:56px;border-top:3px dashed var(--a);margin-top:12px;list-style:none}
.cut span{position:absolute;top:-.85em;${rtl ? 'left' : 'right'}:0;background:var(--i9);color:var(--a);padding:0 12px;font-family:${rtl ? 'Cairo' : 'JBMono'};font-weight:700;font-size:26px}
.win{background:#0A0A0A;border:1px solid var(--i7);border-radius:24px;padding:28px 30px;direction:ltr;text-align:left}
.wl{font-family:JBMono;color:var(--a);font-size:21px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;margin-bottom:12px}
.wl[dir=rtl]{text-align:right;letter-spacing:0;font-family:Cairo;font-size:26px}
pre{font-family:JBMono;font-size:25px;line-height:1.55;color:#E5E5E5;white-space:pre-wrap}
pre .k{color:#7DB4FF}pre .s{color:#86EFAC}pre .c{color:var(--i4)}
.bar{display:flex;gap:10px;align-items:center;margin-bottom:18px}.bar i{width:15px;height:15px;border-radius:50%;background:var(--i7)}
.bar span{font-family:JBMono;color:var(--i4);font-size:21px;margin-left:10px}
.tl{font-family:JBMono;font-size:26px;line-height:1.6;color:#E5E5E5}.tl .p{color:var(--a)}.tl .out{color:var(--i3)}.tl .bad{color:#F87171}.tl .ok{color:#34D399}
.cmp{display:grid;grid-template-columns:1fr;gap:22px}
.col{border-radius:24px;padding:26px 30px;border:1px solid var(--i7);background:rgba(255,255,255,.02)}
.col.yes{border-color:color-mix(in srgb,var(--a) 55%,transparent);background:color-mix(in srgb,var(--a) 7%,transparent)}
.col h4{font-size:${rtl ? 30 : 24}px;font-weight:700;${rtl ? '' : 'letter-spacing:.12em;text-transform:uppercase;'}color:var(--i4);margin-bottom:14px}.col.yes h4{color:var(--a)}
.col ul{list-style:none;display:flex;flex-direction:column;gap:12px}
.col li{font-size:${rtl ? 32 : 30}px;line-height:1.35;padding-${rtl ? 'right' : 'left'}:1.2em;position:relative}
.col li::before{position:absolute;${rtl ? 'right' : 'left'}:0;content:'×';color:var(--i4)}.col.yes li::before{content:'✓';color:var(--a)}.col.no li{color:var(--i3)}
.frame{background:#0A0A0A;border:1px solid var(--i7);border-radius:24px;padding:16px;overflow:hidden}
.frame .bar{margin-bottom:14px;padding:0 6px}
.shot{height:440px;overflow:hidden;border-radius:14px}
.shot img{display:block;width:100%;animation:pan ${SECONDS}s ease-in-out both}
@keyframes pan{0%,25%{transform:translateY(0)}100%{transform:translateY(-10%)}}
.chips{display:flex;flex-wrap:wrap;gap:14px}
.chips span{border:1px solid var(--i7);border-radius:999px;padding:12px 22px;font-size:${rtl ? 30 : 27}px;color:var(--i3)}
.end{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;animation:pop .6s cubic-bezier(.2,.7,.2,1) both;animation-delay:${SECONDS - 1.9}s;direction:ltr}
.end .big{font-family:JBMono;font-weight:600;font-size:96px;letter-spacing:.06em}.end .big span{color:var(--i4)}
.end .url{font-family:Sora;font-weight:700;font-size:60px;color:var(--a)}
.end .h{font-family:Sora;font-size:36px;color:var(--i3)}
</style></head><body>
<div class="bg"></div><div class="dots"></div>
<div class="main">
  <div class="mark"><span>&lt;/&gt;</span>DEVYA</div>
  <div class="pill">${esc(t.kicker)}</div>
  <h1${/[\u0600-\u06FF]/.test(t.title) ? '' : ` dir="ltr" style="text-align:${rtl ? 'right' : 'left'}"`}>${words(t.title, 0.9)}</h1>
  ${t.sub && (statement || day.layout === 'product') ? `<p class="sub">${rich(t.sub)}</p>` : ''}
  ${statement ? '' : `<div class="stage">${stage(day, t, lang, bodyStart + (day.layout === 'product' && t.sub ? 0.4 : 0))}</div>`}
</div>
<div class="end"><div class="big"><span>&lt;/&gt;</span>DEVYA</div><div class="url">devya.dev</div><div class="h">@devyasoftware</div></div>
</body></html>`;
}

async function renderReel(browser, day, lang, out) {
  const frames = mkdtempSync(join(tmpdir(), 'devya-reel-'));
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.setContent(html(day, lang), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const over = await page.evaluate(() => {
    document.getAnimations().forEach((a) => { a.pause(); a.currentTime = 7000; });
    const m = document.querySelector('.main');
    const box = m.getBoundingClientRect();
    const deepest = Math.max(...[...m.querySelectorAll('*')].map((e) => e.getBoundingClientRect().bottom));
    return deepest > box.bottom + 2;
  });
  if (over) console.error(`OVERFLOW reel ${day.date} ${lang}`);
  for (let f = 0; f < FPS * SECONDS; f++) {
    await page.evaluate((ms) => document.getAnimations().forEach((a) => { a.currentTime = ms; }), (f * 1000) / FPS);
    await page.screenshot({ path: join(frames, `${String(f).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 92 });
  }
  await page.close();
  const ff = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(frames, '%04d.jpg'),
    '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-shortest',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', out], { stdio: 'inherit' });
  rmSync(frames, { recursive: true, force: true });
  if (ff.status !== 0) throw new Error(`ffmpeg failed for ${out}`);
  // Cover frame (the full card, before the end card) for Reel covers and the LinkedIn video thumbnail.
  spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '7.0', '-i', out, '-frames:v', '1', '-q:v', '2', out.replace(/\.mp4$/, '-cover.jpg')], { stdio: 'inherit' });
  return !over;
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
      if (!force && existsSync(out)) continue;
      if (day.layout === 'product' && !day._shot) {
        const shot = join(dir, 'shot.png');
        if (!existsSync(shot)) await shoot(browser, day.card.shot, shot);
        day._shot = readFileSync(shot).toString('base64');
      }
      if (!(await renderReel(browser, day, lang, out))) bad++;
      console.log(`rendered ${day.date} reel-${lang}.mp4`);
    }
  }
  await browser.close();
  if (bad) process.exit(1);
}

main().catch(fail);
