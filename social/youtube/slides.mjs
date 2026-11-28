// Slides for the YouTube videos, in the www.devya.dev theme (render/brand.mjs:
// black ink-900, silver accents, the official wordmark), rendered with
// Playwright like the social cards.
//
//   landscape  1920x1080, the long-form video
//   portrait   1080x1920, a Short: the slide in the upper part, the Short's
//              title on top and burned-in captions below, inside the safe area
//   thumbnail  1280x720
//
// A slide is drawn once with every element; a screen state then reveals the
// keys said so far and lights the one being talked about (applyState), so the
// screen follows the voice word by word. Element types: hook, bullets, code,
// terminal, flow, compare, stats, end.

import { CSS_VARS, logoImg } from '../render/brand.mjs';
import { FONTS, THEME_CSS, esc, rich } from '../render/render.mjs';

export const SIZES = { landscape: [1920, 1080], portrait: [1080, 1920], thumbnail: [1280, 720] };
export const LOGO = { landscape: 190, portrait: 230, thumbnail: 190 };

const CODE_KW = /\b(FROM|AS|WORKDIR|COPY|RUN|ENV|EXPOSE|CMD|USER|ARG|HEALTHCHECK|const|let|await|async|return|function|import|export|from|default|module|if|else|new|services|image|build|ports|restart|healthcheck|test|volumes|reverse_proxy|encode|true|false)\b/g;
function codeLine(s) {
  const c = s.search(/(^|\s)(\/\/|#)/);
  const body = c >= 0 ? s.slice(0, c) : s;
  const comment = c >= 0 ? s.slice(c) : '';
  return esc(body).replace(/(&quot;.*?&quot;|'.*?')/g, '<span class="s">$1</span>').replace(CODE_KW, '<span class="k">$1</span>') + (comment ? `<span class="c">${esc(comment)}</span>` : '');
}

const k = (it) => (it.k ? ` data-k="${esc(it.k)}"` : '');

function body(slide) {
  switch (slide.type) {
    case 'hook':
      return `<div class="hook"><div class="pill"${k({ k: slide.kickerKey })}>${esc(slide.kicker || '')}</div><h1>${rich(slide.title)}</h1>${slide.sub ? `<p class="sub"${k({ k: slide.subKey })}>${rich(slide.sub)}</p>` : ''}${slide.chips ? `<div class="chips">${slide.chips.map((c) => `<span${k(c)}>${rich(c.text)}</span>`).join('')}</div>` : ''}</div>`;
    case 'bullets':
      return `<ol class="list">${slide.items.map((it, i) => `<li class="item"${k(it)}><b>${String(i + 1).padStart(2, '0')}</b><span>${rich(it.text)}</span></li>`).join('')}</ol>`;
    case 'code':
      return `<div class="win"${slide.file ? '' : ''}><div class="bar" dir="ltr"><i></i><i></i><i></i><span>${esc(slide.file || '')}</span></div><pre dir="ltr">${slide.lines.map((l) => `<div class="cl"${k(l)}>${l.code ? codeLine(l.code) : '&nbsp;'}</div>`).join('')}</pre></div>`;
    case 'terminal':
      return `<div class="win term" dir="ltr"><div class="bar"><i></i><i></i><i></i><span>${esc(slide.file || 'zsh')}</span></div><div class="tl">${slide.lines.map((l) => {
        const t = l.text || '';
        const html = t.startsWith('$ ') ? `<span class="p">$</span> ${esc(t.slice(2))}` : esc(t);
        const cls = t.startsWith('$ ') ? 'cmd' : /^(✗|error|FAIL)/i.test(t) ? 'bad' : /^(✓|ok|PASS)/.test(t) ? 'ok' : 'out';
        return `<div class="${cls}"${k(l)}>${html || '&nbsp;'}</div>`;
      }).join('')}</div></div>`;
    case 'flow':
      return `<div class="flow ${slide.nodes.length > 4 ? 'many' : ''}">${slide.nodes.map((n, i) => `${i ? `<div class="arrow"${k(n)}></div>` : ''}<div class="node"${k(n)}><b>${rich(n.label)}</b>${n.sub ? `<span>${rich(n.sub)}</span>` : ''}</div>`).join('')}</div>`;
    case 'compare':
      return `<div class="cmp">${['left', 'right'].map((side) => `<div class="col ${side}"${k(slide[side])}><h4>${rich(slide[side].label)}</h4><ul>${slide[side].items.map((it) => `<li${k(it)}>${rich(it.text)}</li>`).join('')}</ul></div>`).join('')}</div>`;
    case 'stats':
      return `<div class="stats">${slide.stats.map((s) => `<div class="stat"${k(s)}><b dir="ltr">${esc(s.value)}</b><span>${rich(s.label)}</span></div>`).join('')}</div>${slide.source ? `<p class="src" dir="ltr">${esc(slide.source)}</p>` : ''}`;
    case 'end':
      return `<div class="endcard"><div class="url" dir="ltr">devya.dev</div>${slide.line ? `<p>${rich(slide.line)}</p>` : ''}</div>`;
    default:
      throw new Error(`unknown slide type ${slide.type}`);
  }
}

const BASE_CSS = `${FONTS}
${THEME_CSS}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;background:var(--bg);color:var(--fg);overflow:hidden}
body{font-family:Cairo,Sora,sans-serif;-webkit-font-smoothing:antialiased;position:relative}
.glow{position:absolute;inset:0;background:radial-gradient(1100px 700px at 88% 8%,var(--glow),transparent 60%),radial-gradient(900px 700px at 0% 100%,var(--glow2),transparent 60%);pointer-events:none}
.grid{position:absolute;inset:0;background-image:linear-gradient(var(--hair) 1px,transparent 1px),linear-gradient(90deg,var(--hair) 1px,transparent 1px);background-size:64px 64px;mask-image:radial-gradient(ellipse at center,#000 30%,transparent 80%);pointer-events:none}
header{position:absolute;display:flex;align-items:center}
.chap{position:absolute;color:var(--muted);font-weight:600;letter-spacing:.02em}
main{position:absolute;display:flex;flex-direction:column}
h2.title{font-weight:800;line-height:1.25;color:var(--fg)}
[data-k]{transition:none}
.hidden{visibility:hidden}
.dim{opacity:.38}
.focus{color:var(--fg)!important;opacity:1}
.pill{display:inline-block;border:1px solid var(--line2);color:var(--silver);border-radius:999px;font-weight:700;align-self:flex-start}
.hook{display:flex;flex-direction:column;align-items:center;text-align:center}.hook .pill{align-self:center}.hook h1{font-weight:800;line-height:1.2}
.hook .sub{color:var(--muted);font-weight:500;line-height:1.5}
.chips{display:flex;flex-wrap:wrap;justify-content:center}
.chips span{border:1px solid var(--line2);border-radius:999px;color:var(--fg2);font-weight:700;background:var(--bg2)}
.chips span.focus{border-color:var(--silver-edge);box-shadow:0 0 50px var(--glow)}
.list{list-style:none;display:flex;flex-direction:column}
.item{display:flex;align-items:flex-start;color:var(--fg2);border:1px solid transparent;border-radius:18px;line-height:1.45}
.item b{font-family:JBMono,monospace;color:var(--silver-dim);font-weight:700;flex:none}
.item.focus{background:var(--card);border-color:var(--line2);box-shadow:0 0 0 1px var(--hair2),0 0 60px var(--glow)}
.item.focus b{color:var(--silver)}
.win{background:var(--bg2);border:1px solid var(--line);border-radius:20px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.5)}
.win .bar{display:flex;align-items:center;gap:10px;padding:14px 20px;border-bottom:1px solid var(--line);color:var(--muted);font-family:JBMono,monospace}
.win .bar i{width:13px;height:13px;border-radius:50%;background:var(--line2);display:block}
.win .bar span{margin-left:12px}
pre,.tl{font-family:JBMono,monospace;color:var(--fg2);white-space:pre}
.cl,.tl>div{border-radius:0;padding:0 14px}
.cl.focus,.tl>div.focus{background:var(--card);box-shadow:inset 4px 0 0 var(--silver)}
.tl .cmd .p{color:var(--silver)}.tl .out{color:var(--muted)}.tl .ok{color:var(--fg);font-weight:600}.tl .bad{color:var(--silver-dim)}
.flow{display:flex;align-items:stretch;justify-content:center}
.node{flex:1;background:var(--bg2);border:1px solid var(--line);border-radius:22px;display:flex;flex-direction:column;justify-content:center;text-align:center}
.node b{font-weight:800;color:var(--fg)}
.node span{color:var(--muted);font-weight:500;line-height:1.45}
.node.focus{background:var(--card);border-color:var(--silver-edge);box-shadow:0 0 70px var(--glow)}
.arrow{flex:none;align-self:center;position:relative}
.arrow::before{content:"";position:absolute;top:50%;left:0;right:10px;height:3px;background:var(--line2);transform:translateY(-50%)}
.arrow::after{content:"";position:absolute;top:50%;right:0;border:9px solid transparent;border-left-color:var(--line2);transform:translateY(-50%)}
[dir=rtl] .arrow{transform:scaleX(-1)}
.cmp{display:grid;grid-template-columns:1fr 1fr}
.col{background:var(--bg2);border:1px solid var(--line);border-radius:22px}
.col h4{font-weight:800;color:var(--silver)}
.col ul{list-style:none;display:flex;flex-direction:column}
.col li{color:var(--fg2);line-height:1.45;padding-inline-start:30px;position:relative}
.col li::before{content:"";position:absolute;inset-inline-start:0;top:.62em;width:12px;height:12px;border-radius:3px;background:var(--line2)}
.col.right li::before{background:var(--silver)}
.col li.focus{color:var(--fg)}
.stats{display:grid;grid-auto-flow:column;grid-auto-columns:1fr}
.stat{background:var(--bg2);border:1px solid var(--line);border-radius:22px;text-align:center;display:flex;flex-direction:column;justify-content:center}
.stat b{font-family:Sora,Cairo,sans-serif;font-weight:800;color:var(--fg);letter-spacing:-.02em}
.stat span{color:var(--muted);font-weight:600;line-height:1.4}
.stat.focus{border-color:var(--silver-edge);box-shadow:0 0 70px var(--glow)}
.src{color:var(--faint);font-family:JBMono,monospace}
.endcard{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.endcard .url{font-family:Sora,sans-serif;font-weight:700;color:var(--silver)}
.endcard p{color:var(--muted);font-weight:600}
footer{position:absolute;color:var(--faint);font-family:Sora,sans-serif;font-weight:600}
.caption{position:absolute;left:60px;right:60px;text-align:center;font-weight:800;line-height:1.35;color:var(--fg);white-space:pre-line}
.caption span{background:rgba(0,0,0,.72);box-decoration-break:clone;-webkit-box-decoration-break:clone;padding:6px 18px;border-radius:14px}
.shorttitle{position:absolute;left:60px;right:60px;text-align:center;font-weight:800;line-height:1.3;color:var(--fg)}
.shorttitle~main h2.title{display:none}
`;

const LAYOUT_CSS = {
  landscape: `header{top:56px;left:72px}.chap{top:58px;right:72px;font-size:24px}
main{top:150px;left:120px;right:120px;bottom:110px;justify-content:center;gap:44px}
h2.title{font-size:58px}
.hook h1{font-size:104px}.hook .sub{font-size:40px;margin-top:30px;max-width:1450px}.chips{gap:18px;margin-top:44px}.chips span{font-size:34px;padding:10px 30px}.pill{font-size:28px;padding:10px 26px;margin-bottom:34px}
.list{gap:14px}.item{gap:26px;font-size:40px;padding:14px 26px}.item b{font-size:30px;margin-top:8px}
pre,.tl{font-size:33px;line-height:1.55;padding:22px 16px}.win .bar{font-size:22px}
.flow{gap:0}.node{padding:34px 26px;gap:12px;min-height:250px}.node b{font-size:42px}.node span{font-size:28px}.arrow{width:74px;height:20px}
.flow.many .node b{font-size:34px}.flow.many .node span{font-size:24px}.flow.many .arrow{width:46px}
.cmp{gap:40px}.col{padding:36px 40px}.col h4{font-size:40px;margin-bottom:24px}.col ul{gap:18px}.col li{font-size:34px}
.stats{gap:36px}.stat{padding:44px 28px;gap:16px}.stat b{font-size:110px}.stat span{font-size:32px}.src{font-size:22px}
.endcard .url{font-size:110px}.endcard p{font-size:40px;margin-top:26px}
footer{bottom:44px;left:72px;font-size:24px}
.dense pre,.dense .tl{font-size:27px;line-height:1.42;padding:14px 12px}.dense{gap:30px}`,
  portrait: `header{top:150px;left:60px}.chap{display:none}
.shorttitle{top:250px;font-size:62px}
main{top:470px;left:60px;right:60px;height:820px;justify-content:center;gap:28px}
h2.title{font-size:50px}
.hook h1{font-size:76px}.hook .sub{font-size:36px;margin-top:20px}.chips{gap:12px;margin-top:28px}.chips span{font-size:28px;padding:8px 22px}.pill{font-size:28px;padding:8px 22px;margin-bottom:26px}
.list{gap:10px}.item{gap:18px;font-size:38px;padding:10px 18px}.item b{font-size:26px;margin-top:8px}
pre,.tl{font-size:24px;line-height:1.5;padding:16px 8px}.win .bar{font-size:20px}
.flow{flex-direction:column;gap:0}.node{padding:20px;gap:6px}.node b{font-size:38px}.node span{font-size:26px}.arrow{width:20px;height:44px;align-self:center}
.arrow::before{top:0;bottom:10px;left:50%;right:auto;width:3px;height:auto;transform:translateX(-50%)}
.arrow::after{top:auto;bottom:0;right:auto;left:50%;border-left-color:transparent;border-top-color:var(--line2);transform:translateX(-50%)}
[dir=rtl] .arrow{transform:none}
.cmp{grid-template-columns:1fr 1fr;gap:16px}.col{padding:20px 18px}.col h4{font-size:32px;margin-bottom:14px}.col ul{gap:12px}.col li{font-size:27px;padding-inline-start:24px}.col li::before{width:10px;height:10px}
.stats{grid-auto-flow:row;grid-template-columns:1fr 1fr;gap:18px}.stat{padding:22px;gap:6px}.stat b{font-size:76px}.stat span{font-size:28px}.src{font-size:20px}
.flow.many{display:grid;grid-template-columns:1fr 1fr;gap:16px}.flow.many .arrow{display:none}.flow.many .node b{font-size:32px}.flow.many .node span{font-size:24px}
.caption{top:1330px;font-size:52px}
footer{bottom:250px;left:0;right:0;text-align:center;font-size:26px}
.dense pre,.dense .tl{font-size:21px;line-height:1.4;padding:10px 4px}`,
};

// The full page for one slide. `opts.chapter` labels the top corner; for a
// Short, `opts.shortTitle` sits on top and `caption` below.
export function slideHtml(slide, { fmt = 'landscape', lang = 'ar', chapter = '', shortTitle = '' } = {}) {
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const title = slide.title && slide.type !== 'hook' ? `<h2 class="title">${rich(slide.title)}</h2>` : '';
  const isEnd = slide.type === 'end';
  const logoW = isEnd ? (fmt === 'portrait' ? 520 : 620) : LOGO[fmt];
  const head = isEnd ? '' : `<header dir="ltr">${logoImg(logoW)}</header>`;
  const main = isEnd
    ? `<main class="endmain" style="inset:0;justify-content:center;align-items:center;gap:${fmt === 'portrait' ? 90 : 110}px">${logoImg(logoW)}${body(slide)}</main>`
    : `<main class="${slide.dense ? 'dense' : ''}">${title}${body(slide)}</main>`;
  return `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><style>:root{${CSS_VARS}}${BASE_CSS}${LAYOUT_CSS[fmt]}</style></head>
<body><div class="glow"></div><div class="grid"></div>${head}${chapter && fmt === 'landscape' && !isEnd ? `<div class="chap">${esc(chapter)}</div>` : ''}${shortTitle ? `<div class="shorttitle">${rich(shortTitle)}</div>` : ''}${main}${fmt === 'portrait' ? '<div class="caption" id="cap"></div>' : ''}${isEnd ? '' : `<footer dir="ltr">devya.dev</footer>`}</body></html>`;
}

// Runs in the page: reveal `show` (all keys if it holds "*"), light `focus`,
// dim the rest while something is lit, set the caption text.
export function applyState({ show, focus, caption }) {
  const all = show.includes('*');
  for (const el of document.querySelectorAll('[data-k]')) {
    const key = el.getAttribute('data-k');
    const visible = all || show.includes(key) || key === focus;
    el.classList.toggle('hidden', !visible);
    el.classList.toggle('focus', !!focus && key === focus);
    el.classList.toggle('dim', !!focus && visible && key !== focus && !el.classList.contains('arrow'));
  }
  const cap = document.getElementById('cap');
  if (cap) cap.innerHTML = caption ? `<span>${caption.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])).replace(/\n/g, '<br>')}</span>` : '';
}

// Content that spills out of its area (main) or off the canvas, with the
// whole slide revealed: [] when it fits.
export async function layoutProblems(page) {
  await page.evaluate(applyState, { show: ['*'], focus: null, caption: document_caption() });
  return page.evaluate(() => {
    const m = document.querySelector('main');
    if (!m) return [];
    const r = m.getBoundingClientRect();
    const bad = [...m.querySelectorAll('*')].filter((e) => { const q = e.getBoundingClientRect(); return q.width && (q.bottom > r.bottom + 2 || q.right > window.innerWidth - 20 || q.left < 20 || q.top < r.top - 2); });
    return bad.slice(0, 3).map((e) => `overflows: ${e.textContent.trim().slice(0, 50)}`);
  });
}
const document_caption = () => 'سطر تجريبي للترجمة\nسطر تاني أطول شوية من الأول';

// The thumbnail: a short headline, a kicker and a glyph, black and silver.
export function thumbnailHtml(t, { lang = 'ar' } = {}) {
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const glyph = {
    terminal: `<div class="win term" dir="ltr"><div class="bar"><i></i><i></i><i></i><span>zsh</span></div><div class="tl">${(t.lines || []).map((l) => `<div class="${l.startsWith('$ ') ? 'cmd' : 'out'}">${l.startsWith('$ ') ? `<span class="p">$</span> ${esc(l.slice(2))}` : esc(l)}</div>`).join('')}</div></div>`,
    receipt: `<div class="receipt" dir="ltr">${(t.lines || []).map((l) => `<div>${esc(l)}</div>`).join('')}</div>`,
    stack: `<div class="stack" dir="ltr">${(t.lines || []).map((l) => `<div>${esc(l)}</div>`).join('')}</div>`,
  }[t.glyph] || '';
  return `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><style>:root{${CSS_VARS}}${BASE_CSS}
header{top:40px;left:48px}
.tw{position:absolute;inset:0;display:grid;grid-template-columns:1.15fr .85fr;align-items:center;padding:110px 56px 56px;gap:40px}
.tw h1{font-size:${t.size || 92}px;font-weight:900;line-height:1.22;color:var(--fg)}.tw em{background:none}
.tw .pill{font-size:30px;padding:8px 24px;margin-bottom:26px;font-family:Sora,Cairo,sans-serif}
.tw .left{display:flex;flex-direction:column}
.win{transform:rotate(${dir === 'rtl' ? '' : '-'}2deg)}
pre,.tl{font-size:26px;line-height:1.6;padding:18px 10px}.win .bar{font-size:18px}
.receipt,.stack{background:var(--bg2);border:1px solid var(--line);border-radius:22px;padding:26px 30px;font-family:JBMono,monospace;font-size:28px;line-height:1.7;color:var(--fg2);box-shadow:0 30px 80px rgba(0,0,0,.5)}
.stack div{border:1px solid var(--line2);border-radius:12px;padding:8px 16px;margin:10px 0;text-align:center;background:var(--card)}
</style></head><body><div class="glow"></div><div class="grid"></div><header dir="ltr">${logoImg(LOGO.thumbnail)}</header>
<div class="tw"><div class="left"><div class="pill">${esc(t.kicker)}</div><h1>${String(t.title).split('\n').map(rich).join('<br>')}</h1></div><div>${glyph}</div></div></body></html>`;
}
