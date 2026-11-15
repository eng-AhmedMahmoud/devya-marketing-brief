#!/usr/bin/env node
// Renders each calendar day's three branded cards (LinkedIn 1200x627 EN,
// Facebook and Instagram 1080x1350 in their day's language) from HTML/CSS to
// PNG with Playwright. Fonts are bundled (fonts/*.woff2) and inlined, so a
// render needs no network except for the product layout's live screenshot.
//
//   node render.mjs                 render days whose PNGs are missing
//   node render.mjs --date 2026-11-15 [--force]
//   node render.mjs --all --force   re-render every day
//
// Output: social/visuals/<date>/{linkedin,facebook,instagram}.png (+ shot.png
// for the product layout). Exits 1 if any card's text overflows its frame.

import { chromium } from 'playwright-core';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOCIAL = join(HERE, '..');
const CALENDAR = join(SOCIAL, 'calendar.json');

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };

const font = (f) => readFileSync(join(HERE, 'fonts', f)).toString('base64');
const FONTS = `
@font-face{font-family:Sora;font-weight:300 800;src:url(data:font/woff2;base64,${font('Sora-latin.woff2')}) format('woff2')}
@font-face{font-family:Cairo;font-weight:300 900;src:url(data:font/woff2;base64,${font('Cairo-arabic.woff2')}) format('woff2');unicode-range:U+0600-06FF,U+0750-077F,U+0870-08FF,U+FB50-FDFF,U+FE70-FEFF,U+200C-200E}
@font-face{font-family:Cairo;font-weight:300 900;src:url(data:font/woff2;base64,${font('Cairo-latin.woff2')}) format('woff2');unicode-range:U+0000-00FF,U+2000-206F}
@font-face{font-family:JBMono;font-weight:400 700;src:url(data:font/woff2;base64,${font('JetBrainsMono-latin.woff2')}) format('woff2')}`;

const ACCENT = { ember: '#F97316', azure: '#3B82F6', lime: '#10B981' };
const SIZE = { portrait: [1080, 1350], landscape: [1200, 627] };
const CUT_LABEL = { en: 'v1 cut line', ar: 'خط الإصدار الأول' };
const GLOW = { statement: '85% 12%', checklist: '100% 100%', code: '0% 100%', terminal: '100% 0%', compare: '50% 110%', product: '0% 0%' };

const esc = (s = '') => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// *word* in a title or line renders in the day's accent colour.
const rich = (s = '') => esc(s).replace(/\*(.+?)\*/g, '<em>$1</em>');

const KW = /\b(const|let|await|async|for|of|in|return|function|import|from|new|if|else|await|using|select|from|where|join|on|group|by|order|limit|explain|analyze)\b/gi;
function highlight(code) {
  return code.split('\n').map((line) => {
    const c = line.search(/(\/\/|#|--\s)/);
    let body = c >= 0 ? line.slice(0, c) : line;
    const comment = c >= 0 ? line.slice(c) : '';
    body = esc(body)
      .replace(/(&quot;.*?&quot;|'.*?'|`.*?`)/g, '<span class="s">$1</span>')
      .replace(KW, '<span class="k">$1</span>');
    return body + (comment ? `<span class="c">${esc(comment)}</span>` : '');
  }).join('\n');
}

function terminal(lines) {
  return lines.map((l) => {
    if (l.startsWith('$ ')) return `<div><span class="p">$</span> ${esc(l.slice(2))}</div>`;
    if (/^(✗|error|ERROR|FAIL)/.test(l)) return `<div class="bad">${esc(l)}</div>`;
    if (/^(✓|ok|PASS)/.test(l)) return `<div class="ok">${esc(l)}</div>`;
    return `<div class="out">${esc(l)}</div>`;
  }).join('');
}

function body(day, t, fmt, lang) {
  const c = day.card;
  switch (day.layout) {
    case 'checklist': {
      const items = t.items.map((it, i) => {
        const cut = c.cut && i === c.cut ? `<li class="cut"><span>${CUT_LABEL[lang]}</span></li>` : '';
        const later = c.cut && i >= c.cut ? ' later' : '';
        return `${cut}<li class="item${later}"><b>${String(i + 1).padStart(2, '0')}</b><span>${rich(it)}</span></li>`;
      }).join('');
      return `<ol class="list">${items}</ol>`;
    }
    case 'code':
      return c.code.map((b) => {
        const label = b.label && typeof b.label === 'object' ? b.label[lang] : b.label;
        return `<div class="win">${label ? `<div class="wl" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">${esc(label)}</div>` : ''}<pre dir="ltr">${highlight(b.code)}</pre></div>`;
      }).join('');
    case 'terminal':
      return `<div class="win term" dir="ltr"><div class="bar"><i></i><i></i><i></i></div><div class="tl">${terminal(c.terminal)}</div></div>`;
    case 'compare':
      return `<div class="cmp"><div class="col no"><h4>${esc(t.left.label)}</h4><ul>${t.left.items.map((x) => `<li>${rich(x)}</li>`).join('')}</ul></div><div class="col yes"><h4>${esc(t.right.label)}</h4><ul>${t.right.items.map((x) => `<li>${rich(x)}</li>`).join('')}</ul></div></div>`;
    case 'product':
      return `<div class="frame"><div class="bar" dir="ltr"><i></i><i></i><i></i><span>${esc(c.shotLabel || c.shot.replace(/^https?:\/\/(www\.)?/, ''))}</span></div><img src="data:image/png;base64,${day._shot}"></div>${t.items ? `<div class="chips">${t.items.map((x) => `<span>${rich(x)}</span>`).join('')}</div>` : ''}`;
    default:
      return '';
  }
}

function html(day, fmt, lang) {
  const t = day.card[lang];
  const [w, h] = SIZE[fmt];
  const accent = ACCENT[day.accent];
  const rtl = lang === 'ar';
  const isStatement = day.layout === 'statement';
  const p = fmt === 'portrait';
  return `<!doctype html><html lang="${lang}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><style>
${FONTS}
*{box-sizing:border-box;margin:0;padding:0}
:root{--a:${accent};--i9:#0F0F0F;--i8:#1A1A1A;--i7:#262626;--i4:#737373;--i3:#A3A3A3;--i1:#F5F5F5}
html,body{width:${w}px;height:${h}px;overflow:hidden}
body{background:var(--i9);color:var(--i1);font-family:${rtl ? 'Cairo' : 'Sora'},sans-serif;
  background-image:radial-gradient(circle at ${GLOW[day.layout]},color-mix(in srgb,var(--a) 17%,transparent),transparent 58%),radial-gradient(rgba(255,255,255,.045) 1.4px,transparent 1.7px);
  background-size:100% 100%,28px 28px;display:flex;flex-direction:column;padding:${p ? '84px 88px 64px' : '44px 56px 34px'}}
em{font-style:normal;color:var(--a)}
header{display:flex;justify-content:space-between;align-items:center;direction:ltr}
.mark{font-family:JBMono;font-weight:600;font-size:${p ? 34 : 24}px;letter-spacing:.06em}.mark span{color:var(--i4)}
.dot{width:${p ? 18 : 13}px;height:${p ? 18 : 13}px;border-radius:50%;background:var(--a);box-shadow:0 0 24px var(--a)}
.content{flex:1;min-height:0;display:${p || isStatement ? 'flex' : 'grid'};${p || isStatement ? 'flex-direction:column;' : 'grid-template-columns:1fr 1.08fr;gap:44px;align-items:center;'}${isStatement || p ? 'justify-content:center;' : 'padding-top:26px;'}${p ? 'padding:24px 0;' : ''}}
.lead{display:flex;flex-direction:column;${p ? '' : 'justify-content:center;'}}
.pill{align-self:flex-start;color:var(--a);background:color-mix(in srgb,var(--a) 13%,transparent);border:1px solid color-mix(in srgb,var(--a) 30%,transparent);
  border-radius:999px;padding:${p ? '10px 24px' : '6px 16px'};font-weight:700;font-size:${p ? (rtl ? 26 : 22) : (rtl ? 18 : 15)}px;${rtl ? '' : 'letter-spacing:.14em;text-transform:uppercase;'}margin-bottom:${p ? 34 : 18}px}
h1{font-weight:${rtl ? 800 : 700};letter-spacing:${rtl ? 0 : '-.02em'};line-height:${rtl ? 1.38 : 1.06};
  font-size:${isStatement ? (p ? (rtl ? 92 : 104) : (rtl ? 54 : 62)) : (p ? (rtl ? 66 : 72) : (rtl ? 40 : 46))}px;${isStatement && !p ? 'max-width:1000px' : ''}}
.sub{color:var(--i3);font-size:${p ? (rtl ? 36 : 34) : (rtl ? 22 : 21)}px;line-height:${rtl ? 1.7 : 1.45};margin-top:${p ? 30 : 16}px;max-width:${p ? 880 : 1000}px}
.stage{${p ? 'margin-top:44px;' : ''}display:flex;flex-direction:column;gap:${p ? 22 : 12}px;min-height:0}
.list{list-style:none;display:flex;flex-direction:column}
.item{display:flex;gap:${p ? 26 : 16}px;align-items:baseline;padding:${p ? 22 : 9}px 0;border-bottom:1px solid var(--i8);font-size:${p ? (rtl ? 34 : 33) : (rtl ? 20 : 19)}px;line-height:${rtl ? 1.55 : 1.35}}
.item b{font-family:JBMono;color:var(--a);font-size:.8em;font-weight:600;min-width:1.9em}
.item.later{opacity:.42}
.cut{position:relative;height:${p ? 54 : 30}px;border-top:3px dashed var(--a);margin-top:${p ? 10 : 6}px}
.cut span{position:absolute;top:-.85em;${rtl ? 'left' : 'right'}:0;background:var(--i9);color:var(--a);padding:0 12px;font-family:${rtl ? 'Cairo' : 'JBMono'};font-weight:700;font-size:${p ? 24 : 15}px}
.win{background:#0A0A0A;border:1px solid var(--i7);border-radius:${p ? 22 : 14}px;padding:${p ? '26px 32px' : '14px 20px'};direction:ltr;text-align:left}
.wl{font-family:JBMono;color:var(--a);font-size:${p ? 20 : 13}px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;margin-bottom:${p ? 12 : 6}px}
.wl[dir=rtl]{text-align:right;letter-spacing:0;font-family:Cairo;font-size:${p ? 24 : 15}px}
pre{font-family:JBMono;font-size:${p ? 25 : 15.5}px;line-height:1.55;color:#E5E5E5;white-space:pre-wrap}
pre .k{color:#7DB4FF}pre .s{color:#86EFAC}pre .c{color:var(--i4)}
.bar{display:flex;gap:9px;align-items:center;margin-bottom:${p ? 18 : 10}px}.bar i{width:${p ? 14 : 10}px;height:${p ? 14 : 10}px;border-radius:50%;background:var(--i7)}
.bar span{font-family:JBMono;color:var(--i4);font-size:${p ? 20 : 13}px;margin-left:10px}
.tl{font-family:JBMono;font-size:${p ? 25 : 15.5}px;line-height:1.6;color:#E5E5E5}.tl .p{color:var(--a)}.tl .out{color:var(--i3)}.tl .bad{color:#F87171}.tl .ok{color:#34D399}
.cmp{display:grid;grid-template-columns:1fr 1fr;gap:${p ? 22 : 14}px}
.col{border-radius:${p ? 22 : 14}px;padding:${p ? '28px 28px' : '16px 18px'};border:1px solid var(--i7);background:rgba(255,255,255,.02)}
.col.yes{border-color:color-mix(in srgb,var(--a) 55%,transparent);background:color-mix(in srgb,var(--a) 7%,transparent)}
.col h4{font-size:${p ? (rtl ? 26 : 22) : (rtl ? 16 : 14)}px;font-weight:700;${rtl ? '' : 'letter-spacing:.12em;text-transform:uppercase;'}color:var(--i4);margin-bottom:${p ? 16 : 8}px}.col.yes h4{color:var(--a)}
.col ul{list-style:none;display:flex;flex-direction:column;gap:${p ? 16 : 7}px}
.col li{font-size:${p ? (rtl ? 29 : 27) : (rtl ? 17 : 16)}px;line-height:${rtl ? 1.5 : 1.32};padding-${rtl ? 'right' : 'left'}:1.2em;position:relative}
.col li::before{position:absolute;${rtl ? 'right' : 'left'}:0;content:'×';color:var(--i4)}.col.yes li::before{content:'✓';color:var(--a)}
.col.no li{color:var(--i3)}
.frame{background:#0A0A0A;border:1px solid var(--i7);border-radius:${p ? 22 : 14}px;padding:${p ? 16 : 10}px;overflow:hidden}
.frame .bar{margin-bottom:${p ? 14 : 8}px;padding:0 6px}
.frame img{display:block;width:100%;height:${p ? 470 : 250}px;object-fit:cover;object-position:top;border-radius:${p ? 12 : 8}px}
.chips{display:flex;flex-wrap:wrap;gap:${p ? 12 : 8}px}
.chips span{border:1px solid var(--i7);border-radius:999px;padding:${p ? '10px 20px' : '5px 12px'};font-size:${p ? (rtl ? 26 : 23) : (rtl ? 15 : 14)}px;color:var(--i3)}
footer{display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--i7);padding-top:${p ? 26 : 14}px;margin-top:${p ? 30 : 16}px;color:var(--i4);font-size:${p ? 26 : 17}px;direction:ltr;font-family:Sora}
</style></head><body>
<header><div class="mark"><span>&lt;/&gt;</span>DEVYA</div><div class="dot"></div></header>
<main class="content"><div class="lead"><div class="pill">${esc(t.kicker)}</div><h1>${rich(t.title)}</h1>${t.sub ? `<p class="sub">${rich(t.sub)}</p>` : ''}</div>${isStatement ? '' : `<div class="stage">${body(day, t, fmt, lang)}</div>`}</main>
<footer><span>@devyasoftware</span><span>devya.dev</span></footer>
</body></html>`;
}

async function shoot(browser, url, out) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  // Decline the consent banner (privacy-preserving default) so it isn't in the shot.
  const reject = page.getByRole('button', { name: /reject all/i });
  if (await reject.count()) await reject.first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await page.screenshot({ path: out });
  await ctx.close();
}

async function main() {
  const cal = JSON.parse(readFileSync(CALENDAR, 'utf8'));
  let days = cal.days;
  if (opt('--date')) days = days.filter((d) => d.date === opt('--date'));
  const force = flag('--force') || flag('--all');
  const browser = await chromium.launch();
  let overflow = 0;
  for (const day of days) {
    const dir = join(SOCIAL, 'visuals', day.date);
    const targets = Object.entries(day.posts).map(([net, post]) => ({ net, lang: post.lang, fmt: net === 'linkedin' ? 'landscape' : 'portrait', out: join(dir, `${net}.png`) }));
    if (!force && targets.every((t) => existsSync(t.out))) continue;
    mkdirSync(dir, { recursive: true });
    if (day.layout === 'product') {
      const shot = join(dir, 'shot.png');
      if (force || !existsSync(shot)) await shoot(browser, day.card.shot, shot);
      day._shot = readFileSync(shot).toString('base64');
    }
    for (const t of targets) {
      const [w, h] = SIZE[t.fmt];
      const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      await page.setContent(html(day, t.fmt, t.lang), { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const over = await page.evaluate(() => {
        const m = document.querySelector('main');
        const f = document.querySelector('footer');
        const deepest = Math.max(...[...m.querySelectorAll('*')].map((e) => e.getBoundingClientRect().bottom));
        const widest = Math.max(...[...m.querySelectorAll('*')].map((e) => e.scrollWidth - e.clientWidth));
        return deepest > f.getBoundingClientRect().top - 4 || widest > 2;
      });
      if (over) { overflow++; console.error(`OVERFLOW ${day.date} ${t.net} (${t.lang})`); }
      await page.screenshot({ path: t.out });
      await page.close();
      console.log(`rendered ${day.date} ${t.net} ${t.lang} ${w}x${h}`);
    }
  }
  await browser.close();
  if (overflow) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
