// Logo and theme for the card and video templates (brand.mjs, brand-check.mjs,
// render.mjs, render-reel.mjs). Uses Playwright's cached Chromium, like the
// renderers. node --test social/render/
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { LOGO_FILE, LOGO_SHA256, LOGO_DATA_URI, LOGO_VIEWBOX, PALETTE, logoSha256, logoImg, offBrandColours, contrast, hexToRgb, INK, CSS_VARS } from './brand.mjs';
import { logoProblems, logoContrastProblems, themePixelProblems, brandProblems, LOGO_MIN_WIDTH } from './brand-check.mjs';
import { html as cardHtml, renderCard, SIZE } from './render.mjs';
import { html as reelHtml, reelBrandProblems, W as RW, H as RH } from './render-reel.mjs';
import { RULES_FROM } from './seo.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOCIAL = join(HERE, '..');
const CAL = JSON.parse(readFileSync(join(SOCIAL, 'calendar.json'), 'utf8'));
// A mid-grey 4x4 PNG stands in for the product layout's live screenshot.
const GREY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAABAAAAAQBPJcTWAAAAFElEQVR4nGOsq6tjgAEWBiSAmwMAS3QBiB+pfJwAAAAASUVORK5CYII=';
const LAYOUTS = ['statement', 'checklist', 'code', 'terminal', 'compare', 'product'];
const dayFor = (layout) => {
  const d = structuredClone([...CAL.days].reverse().find((x) => x.layout === layout));
  if (layout === 'product') d._shot = GREY_PNG;
  return d;
};

let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser?.close(); });

test('the logo is the official www.devya.dev wordmark, unchanged', () => {
  assert.equal(logoSha256(), LOGO_SHA256);
  const svg = readFileSync(LOGO_FILE, 'utf8');
  assert.match(svg, new RegExp(`viewBox="0 0 ${LOGO_VIEWBOX[0]} ${LOGO_VIEWBOX[1]}"`));
  assert.match(svg, /fill="white"/);
  assert.equal(Buffer.from(LOGO_DATA_URI.split(',')[1], 'base64').toString('utf8'), svg);
});

test('palette is the site tokens: black base, silver accents, all neutral', () => {
  assert.equal(INK[900], '#08090a');
  assert.match(CSS_VARS, /--bg:#08090a/);
  assert.match(CSS_VARS, /--silver:#d6dce4/);
  for (const h of PALETTE) {
    const [r, g, b] = hexToRgb(h);
    assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 23, `${h} is a grey/silver`);
  }
  assert.ok(contrast([255, 255, 255], hexToRgb(INK[900])) > 18);
});

test('offBrandColours flags any colour outside the tokens in CSS, not in text', () => {
  assert.deepEqual(offBrandColours('<style>a{color:#F97316;background:color-mix(in srgb,red 5%,transparent)}b{color:#d6dce4}</style>'), ['#F97316', 'color-mix(', 'red']);
  assert.deepEqual(offBrandColours('<div style="border:1px solid rgba(59,130,246,.3)">x</div>'), ['rgba(59,130,246']);
  assert.deepEqual(offBrandColours('<style>a{color:var(--silver);border-color:rgba(214,220,228,.45);background:rgba(255,255,255,.02)}</style><pre>color: #9ca3af; red</pre>'), []);
});

test('card and video templates use only site tokens and the official logo, for every layout, format and language', () => {
  for (const layout of LAYOUTS) {
    const day = dayFor(layout);
    for (const lang of ['en', 'ar']) {
      const docs = [cardHtml(day, 'landscape', lang), cardHtml(day, 'portrait', lang), reelHtml(day, lang)];
      for (const doc of docs) {
        assert.deepEqual(offBrandColours(doc), [], `${layout} ${lang}`);
        assert.ok(doc.includes(`src="${LOGO_DATA_URI}"`), `${layout} ${lang}: official logo`);
        assert.doesNotMatch(doc, /&lt;\/&gt;DEVYA|ember|azure|lime|#F97316|#3B82F6|#10B981/i);
      }
      // The reel shows the logo in the card and on the end card.
      assert.equal(reelHtml(day, lang).split(LOGO_DATA_URI).length - 1, 2);
    }
  }
});

test('rendered cards pass the logo and theme checks (every layout, both formats)', async () => {
  for (const layout of LAYOUTS) {
    const day = dayFor(layout);
    for (const [fmt, lang] of [['landscape', 'en'], ['portrait', 'ar'], ['portrait', 'en']]) {
      const { problems } = await renderCard(browser, day, fmt, lang);
      assert.deepEqual(problems, [], `${day.date} ${layout} ${fmt} ${lang}`);
    }
  }
});

test('the video passes the logo and theme checks in the card and on the end card', async () => {
  for (const layout of ['code', 'product']) {
    const day = dayFor(layout);
    const doc = reelHtml(day, 'en');
    const page = await browser.newPage({ viewport: { width: RW, height: RH } });
    try {
      await page.setContent(doc, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      assert.deepEqual(await reelBrandProblems(page, doc), [], layout);
    } finally { await page.close(); }
  }
});

// A bare black page with the logo; `extra` breaks one rule at a time.
async function check(logoStyle, extra = '', { bg = INK[900], width = 1080, height = 1350 } = {}) {
  const page = await browser.newPage({ viewport: { width, height } });
  try {
    await page.setContent(`<!doctype html><html><head><style>html,body{margin:0;width:${width}px;height:${height}px;background:${bg}}</style></head><body>
      <div style="position:absolute;left:100px;top:100px">${logoImg(280).replace('height:auto"', `height:auto;${logoStyle}"`)}</div>${extra}</body></html>`, { waitUntil: 'load' });
    await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
    return [...await brandProblems(page, await page.screenshot())].join(' | ');
  } finally { await page.close(); }
}

test('logo check: the clean case passes', async () => {
  assert.equal(await check(''), '');
});

test('logo check catches stretching, squashing and a too-small logo', async () => {
  assert.match(await check('height:60px'), /stretched/);
  assert.match(await check('width:280px;height:20px'), /stretched/);
  assert.match(await check('width:120px'), new RegExp(`under ${LOGO_MIN_WIDTH}px`));
});

test('logo check catches recolouring: filters, blend modes, transparency', async () => {
  assert.match(await check('filter:invert(1)'), /filter/);
  assert.match(await check('filter:hue-rotate(90deg) sepia(1)'), /filter/);
  assert.match(await check('mix-blend-mode:difference'), /blend mode/);
  assert.match(await check('opacity:.5'), /opacity 0\.50/);
});

test('logo check catches cropping by the canvas, a container or a clip path', async () => {
  assert.match(await check('margin-left:-200px'), /cropped by the canvas/);
  assert.match(await check('clip-path:inset(0 50% 0 0)'), /clipped/);
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
  try {
    await page.setContent(`<body style="margin:0;background:${INK[900]}"><div style="position:absolute;left:100px;top:100px;width:150px;overflow:hidden">${logoImg(280)}</div></body>`);
    await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
    assert.match((await logoProblems(page)).join(), /cropped by its container/);
  } finally { await page.close(); }
});

test('logo check catches text or shapes inside the clear space and a logo too close to the edge', async () => {
  assert.match(await check('', '<p style="position:absolute;left:100px;top:150px;margin:0;color:#eef0f3;font:20px sans-serif">Too close</p>'), /clear space around the logo holds text "Too close"/);
  assert.match(await check('', '<div style="position:absolute;left:390px;top:100px;width:30px;height:30px;border:1px solid #262a30"></div>'), /clear space around the logo holds <div/);
  assert.match(await check('', '', { width: 400, height: 400 }), /closer to the edge than its clear space/);
  // Far enough away (more than one logo height) is fine.
  assert.equal(await check('', '<p style="position:absolute;left:100px;top:200px;margin:0;color:#eef0f3;font:20px sans-serif">Fine</p>'), '');
});

test('logo check catches poor contrast and a missing or unofficial logo', async () => {
  assert.match(await check('', '', { bg: '#d6dce4' }), /logo contrast 1\.\d:1/);
  const page = await browser.newPage({ viewport: { width: 600, height: 400 } });
  try {
    await page.setContent(`<body style="background:${INK[900]}"><img data-logo src="data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 176 21"><text y="18" fill="white">DEVYA</text></svg>').toString('base64')}" style="width:300px;margin:80px"></body>`);
    assert.match((await logoProblems(page)).join(), /not the official devya-wordmark\.svg/);
    await page.setContent(`<body style="background:${INK[900]}"><h1 style="color:white">DEVYA</h1></body>`);
    assert.deepEqual(await logoProblems(page), ['no official logo is visible']);
  } finally { await page.close(); }
});

test('theme check catches any coloured pixel area (the old ember/azure/lime accents)', async () => {
  for (const c of ['#F97316', '#3B82F6', '#10B981']) {
    assert.match(await check('', `<div style="position:absolute;left:100px;top:700px;width:300px;height:60px;background:${c}"></div>`), /pixels show colour/, c);
  }
  // Silver and grey areas are fine.
  assert.equal(await check('', '<div style="position:absolute;left:100px;top:700px;width:300px;height:60px;background:#7e8794"></div>'), '');
});

test('committed cards for upcoming days are on the black and silver theme', async () => {
  const page = await browser.newPage();
  try {
    let checked = 0;
    for (const d of CAL.days.filter((x) => x.date >= RULES_FROM)) {
      for (const net of ['linkedin', 'facebook', 'instagram']) {
        const f = join(SOCIAL, 'visuals', d.date, `${net}.png`);
        assert.ok(existsSync(f), f);
        assert.deepEqual(await themePixelProblems(page, readFileSync(f)), [], f);
        checked++;
      }
    }
    assert.ok(checked > 0);
  } finally { await page.close(); }
});

test('landscape and portrait sizes are unchanged', () => {
  assert.deepEqual(SIZE, { portrait: [1080, 1350], landscape: [1200, 627] });
  assert.equal(typeof logoContrastProblems, 'function');
});
