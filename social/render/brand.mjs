// Devya brand for the social renderers: the official wordmark and the black /
// silver colour tokens of www.devya.dev (repo eng-AhmedMahmoud/devya-solutions,
// origin/main def94b5: public/devya-wordmark.svg, styles/globals.css :root,
// tailwind.config.ts silver scale). See social/brand/README.md.
//
// Templates use only these tokens; brand-check.mjs fails any card or video
// whose CSS names another colour or whose pixels show a hue.

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BRAND_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'brand');

// styles/globals.css :root ("Deep-dark palette — cool neutrals").
export const INK = {
  0: '#ffffff',
  50: '#eef0f3',
  100: '#dde1e6',
  300: '#828892',
  500: '#45494f',
  700: '#16181b',
  800: '#0f1012',
  900: '#08090a',
};
// globals.css "One accent: cool silver".
export const ACCENT = { silver: '#d6dce4', dim: '#7e8794', edge: '#b8c0cb' };
// tailwind.config.ts `silver` scale (also the site's zinc override).
export const SILVER = {
  50: '#f4f6f9', 100: '#e7eaef', 200: '#d6dce4', 300: '#b8c0cb', 400: '#8e97a5',
  500: '#5e6773', 600: '#3f454f', 700: '#262a30', 800: '#16181b', 900: '#0f1115', 950: '#08090b',
};
// globals.css hairlines and tailwind's silver-glow shadow are rgba() of these.
export const HAIRLINE = 'rgba(255,255,255,.06)';
export const HAIRLINE_STRONG = 'rgba(255,255,255,.14)';

export const PALETTE = new Set([...Object.values(INK), ...Object.values(ACCENT), ...Object.values(SILVER), '#000000'].map((h) => h.toLowerCase()));

const hexToRgb = (h) => { const x = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16)); };
const PALETTE_RGB = new Set([...PALETTE].map((h) => hexToRgb(h).join(',')));

// CSS custom properties every template starts from.
export const CSS_VARS = `--bg:${INK[900]};--bg2:${INK[800]};--card:${INK[700]};--line:${SILVER[700]};--line2:${SILVER[600]};
--fg:${INK[50]};--fg2:${INK[100]};--muted:${INK[300]};--faint:${INK[500]};
--silver:${ACCENT.silver};--silver-dim:${ACCENT.dim};--silver-edge:${ACCENT.edge};
--hair:${HAIRLINE};--hair2:${HAIRLINE_STRONG};--glow:rgba(214,220,228,.10);--glow2:rgba(214,220,228,.05)`;

// Every colour literal in a template's CSS (<style> blocks and style=""
// attributes: hex, rgb/rgba, hsl/hsla, color-mix, named colours) that is not a
// site token. Text content is ignored (a code card may show "#9ca3af" as code);
// the rendered-pixel check covers what is actually painted.
const NAMED = /(?<![\w-])(red|green|blue|orange|yellow|purple|pink|lime|teal|cyan|magenta|navy|maroon|olive|aqua|fuchsia|gold|crimson|coral|salmon|violet|indigo|tomato|turquoise|brown|tan|khaki|orchid|plum|beige|chartreuse|azure|ember)(?![\w-])/gi;
export function offBrandColours(html) {
  const css = (String(html).replace(/url\(data:[^)]*\)|src="data:[^"]*"/g, '').match(/<style>[\s\S]*?<\/style>|style="[^"]*"/g) || []).join('\n');
  const bad = [];
  for (const m of css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
    let h = m[0].toLowerCase();
    if (h.length === 4) h = '#' + [...h.slice(1)].map((c) => c + c).join('');
    if (h.length === 9) h = h.slice(0, 7);
    if (!PALETTE.has(h)) bad.push(m[0]);
  }
  for (const m of css.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)) {
    const rgb = `${m[1]},${m[2]},${m[3]}`;
    if (!PALETTE_RGB.has(rgb) && rgb !== '214,220,228' && rgb !== '255,255,255' && rgb !== '0,0,0') bad.push(m[0]);
  }
  for (const m of css.matchAll(/hsla?\(|color-mix\(|oklch\(|lab\(/g)) bad.push(m[0]);
  for (const m of css.matchAll(NAMED)) bad.push(m[0]);
  return [...new Set(bad)];
}

// The official wordmark, embedded byte for byte.
export const LOGO_FILE = join(BRAND_DIR, 'devya-wordmark.svg');
export const LOGO_SHA256 = '2c1056e5c572b948e009ca6619be9e7ebf423703dfe0d3cd78f66f9ca2928551';
export const LOGO_VIEWBOX = [176, 21];
export const LOGO_FILL = '#ffffff';
const logoBytes = readFileSync(LOGO_FILE);
export const logoSha256 = () => createHash('sha256').update(readFileSync(LOGO_FILE)).digest('hex');
export const LOGO_DATA_URI = `data:image/svg+xml;base64,${logoBytes.toString('base64')}`;

// <img> of the wordmark at a given width; height follows the file's aspect ratio.
export const logoImg = (width, cls = 'logo') => `<img class="${cls}" data-logo alt="Devya" src="${LOGO_DATA_URI}" style="width:${width}px;height:auto">`;

// WCAG relative luminance and contrast ratio, for the logo contrast check.
export function luminance([r, g, b]) {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
export { hexToRgb };
