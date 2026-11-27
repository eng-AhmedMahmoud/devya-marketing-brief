// Brand checks run on every rendered card and video (render.mjs, render-reel.mjs):
//
// Logo (the official wordmark from www.devya.dev, social/brand/):
//   - the <img> carries the official SVG byte for byte (no redrawn mark);
//   - aspect ratio within 1% of the file's (no stretching);
//   - fully inside the canvas and every clipping parent (no cropping);
//   - no filter, blend mode, clip-path or opacity under 1 (no recolouring);
//   - at least LOGO_MIN_WIDTH px wide (it is vector, so sharp at output size);
//   - clear space of one logo height on every side: no other text or shape;
//   - contrast with the background behind it of at least LOGO_MIN_CONTRAST.
// Theme (black and silver): no colour outside the site tokens in the template
// (brand.mjs offBrandColours) and no hue in the rendered pixels.
//
// A failure throws BrandCheckFailed; the renderers exit BRAND_CHECK_EXIT and
// write nothing, so the routine holds whatever would have shown it.

import { LOGO_DATA_URI, LOGO_VIEWBOX, LOGO_FILL, contrast, hexToRgb } from './brand.mjs';

export const BRAND_CHECK_EXIT = 5;
export const LOGO_MIN_WIDTH = 150;
export const LOGO_MIN_CONTRAST = 7;
// Largest max(r,g,b) - min(r,g,b) a pixel may show; the silver tokens reach 23.
export const MAX_CHROMA = 28;
// Share of pixels allowed over MAX_CHROMA (anti-aliasing noise).
export const MAX_COLOURED_SHARE = 0.001;

export class BrandCheckFailed extends Error {
  constructor(what, problems) {
    super(`${what}: ${problems.join('; ')}`);
    this.name = 'BrandCheckFailed';
    this.problems = problems;
  }
}

// Geometry, cropping, recolouring and clear-space checks for every visible logo.
export async function logoProblems(page) {
  return page.evaluate(({ dataUri, aspect, minW }) => {
    const out = [];
    const W = window.innerWidth;
    const H = window.innerHeight;
    const opacity = (el) => {
      let o = 1;
      for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.display === 'none' || cs.visibility === 'hidden') return 0;
        o *= parseFloat(cs.opacity);
      }
      return o;
    };
    const hit = (b, z) => b.width > 0 && b.height > 0 && b.left < z.right && b.right > z.left && b.top < z.bottom && b.bottom > z.top;
    const logos = [...document.querySelectorAll('img[data-logo]')].filter((l) => opacity(l) > 0.01);
    if (!logos.length) return ['no official logo is visible'];
    for (const l of logos) {
      if (l.getAttribute('src') !== dataUri) out.push('logo is not the official devya-wordmark.svg');
      if (!l.complete || !l.naturalWidth) out.push('logo image did not load');
      const r = l.getBoundingClientRect();
      const op = opacity(l);
      if (op < 0.999) out.push(`logo opacity ${op.toFixed(2)}, must be 1`);
      for (let e = l; e && e.nodeType === 1; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.filter !== 'none') out.push(`logo has filter ${cs.filter}`);
        if (cs.mixBlendMode !== 'normal') out.push(`logo has blend mode ${cs.mixBlendMode}`);
        if (cs.clipPath && cs.clipPath !== 'none') out.push('logo is clipped');
        if (e !== l && e !== document.documentElement && e !== document.body && cs.overflow !== 'visible') {
          const p = e.getBoundingClientRect();
          if (r.left < p.left - 0.5 || r.top < p.top - 0.5 || r.right > p.right + 0.5 || r.bottom > p.bottom + 0.5) out.push('logo is cropped by its container');
        }
      }
      const ratio = r.width / r.height;
      if (Math.abs(ratio - aspect) / aspect > 0.01) out.push(`logo stretched: ${ratio.toFixed(3)}:1, the file is ${aspect.toFixed(3)}:1`);
      if (r.left < -0.5 || r.top < -0.5 || r.right > W + 0.5 || r.bottom > H + 0.5) out.push('logo is cropped by the canvas');
      if (r.width < minW) out.push(`logo is ${Math.round(r.width)}px wide, under ${minW}px`);
      const cs = r.height;
      const zone = { left: r.left - cs, top: r.top - cs, right: r.right + cs, bottom: r.bottom + cs };
      if (zone.left < -0.5 || zone.top < -0.5 || zone.right > W + 0.5 || zone.bottom > H + 0.5) out.push('logo is closer to the edge than its clear space (one logo height)');
      const intruders = new Set();
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const t = walker.currentNode;
        if (!t.textContent.trim() || opacity(t.parentElement) < 0.01) continue;
        const range = document.createRange();
        range.selectNodeContents(t);
        for (const b of range.getClientRects()) if (hit(b, zone)) intruders.add(`text "${t.textContent.trim().slice(0, 24)}"`);
      }
      for (const el of document.body.querySelectorAll('*')) {
        if (el === l || el.contains(l) || opacity(el) < 0.01) continue;
        const s = getComputedStyle(el);
        const border = ['Top', 'Right', 'Bottom', 'Left'].some((k) => parseFloat(s[`border${k}Width`]) > 0 && s[`border${k}Style`] !== 'none');
        const paints = ['IMG', 'svg', 'CANVAS', 'VIDEO'].includes(el.tagName) || border || s.backgroundColor !== 'rgba(0, 0, 0, 0)' || s.boxShadow !== 'none';
        if (!paints) continue;
        const b = el.getBoundingClientRect();
        if (b.width >= W * 0.95 && b.height >= H * 0.95) continue; // full-bleed background layer
        if (hit(b, zone)) intruders.add(`<${el.tagName.toLowerCase()} class="${el.className}">`);
      }
      if (intruders.size) out.push(`clear space around the logo holds ${[...intruders].slice(0, 3).join(', ')}`);
    }
    return [...new Set(out)];
  }, { dataUri: LOGO_DATA_URI, aspect: LOGO_VIEWBOX[0] / LOGO_VIEWBOX[1], minW: LOGO_MIN_WIDTH });
}

// Decodes PNG screenshots inside the page (no image library needed) and returns
// per-image stats: share of pixels over MAX_CHROMA, the worst pixel, and the
// brightest pixel (for contrast).
async function pixelStats(page, pngs) {
  return page.evaluate(async ({ list, maxChroma }) => {
    const res = [];
    for (const b64 of list) {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let coloured = 0, worst = 0, worstRgb = [0, 0, 0], bright = [0, 0, 0], brightL = -1;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const ch = Math.max(r, g, b) - Math.min(r, g, b);
        if (ch > maxChroma) coloured++;
        if (ch > worst) { worst = ch; worstRgb = [r, g, b]; }
        const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        if (l > brightL) { brightL = l; bright = [r, g, b]; }
      }
      res.push({ share: coloured / (d.length / 4), worst, worstRgb, bright });
    }
    return res;
  }, { list: pngs.map((b) => b.toString('base64')), maxChroma: MAX_CHROMA });
}

const hex = (rgb) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');

// Pixels of a rendered frame (PNG buffer) must be neutral grey/silver.
export async function themePixelProblems(page, png) {
  const [s] = await pixelStats(page, [png]);
  return s.share > MAX_COLOURED_SHARE ? [`${(s.share * 100).toFixed(2)}% of pixels show colour (worst ${hex(s.worstRgb)}); the theme is black and silver`] : [];
}

// Contrast between the logo fill and the brightest background pixel behind it.
export async function logoContrastProblems(page) {
  const boxes = await page.evaluate(() => [...document.querySelectorAll('img[data-logo]')]
    .filter((l) => { for (let e = l; e && e.nodeType === 1; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) < 0.01) return false; } return true; })
    .map((l) => { const r = l.getBoundingClientRect(); return { x: Math.max(0, r.left), y: Math.max(0, r.top), width: Math.max(1, r.width), height: Math.max(1, r.height) }; }));
  if (!boxes.length) return [];
  await page.addStyleTag({ content: 'img[data-logo]{visibility:hidden !important}' }).then((h) => page.evaluate((el) => { el.id = '__hide_logo'; }, h));
  const shots = [];
  for (const clip of boxes) shots.push(await page.screenshot({ clip }));
  await page.evaluate(() => document.getElementById('__hide_logo')?.remove());
  const stats = await pixelStats(page, shots);
  const fill = hexToRgb(LOGO_FILL);
  const out = [];
  for (const s of stats) {
    const ratio = contrast(fill, s.bright);
    if (ratio < LOGO_MIN_CONTRAST) out.push(`logo contrast ${ratio.toFixed(1)}:1 against ${hex(s.bright)}, needs ${LOGO_MIN_CONTRAST}:1`);
  }
  return out;
}

// Everything at once for the page as it stands; `png` is its screenshot.
export async function brandProblems(page, png) {
  return [...await logoProblems(page), ...await logoContrastProblems(page), ...await themePixelProblems(page, png)];
}
