// Every slide of every script, in both formats, and every thumbnail: nothing
// overflows and the brand check passes (official wordmark, clear space,
// contrast, black and silver pixels). And the sound: the bed loops under the
// voice, ducked, at -14 LUFS with true peak under -1 dBTP.
// Needs Playwright's cached Chromium and ffmpeg (like render/*.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { slideHtml, thumbnailHtml, layoutProblems, SIZES } from './slides.mjs';
import { loadRegistry } from './youtube.mjs';
import { mergeSpans, mixVideo, soundProblems, pickLongBed, layNarration } from './mix.mjs';
import { brandProblems } from '../render/brand-check.mjs';
import { offBrandColours } from '../render/brand.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(join(HERE, '..', 'render', 'package.json'))('playwright-core');
const reg = loadRegistry();
const longs = reg.episodes.filter((e) => e.kind === 'long');

test('every slide and thumbnail fits its frame and passes the brand check', async () => {
  const browser = await chromium.launch();
  const problems = [];
  try {
    for (const ep of longs) {
      const script = JSON.parse(readFileSync(join(HERE, ep.script), 'utf8'));
      const slides = { ...script.slides, end: { type: 'end', line: script.endLine } };
      const shortTitle = reg.episodes.find((e) => e.parent === ep.slug)?.screenTitle;
      for (const fmt of ['landscape', 'portrait']) {
        const [width, height] = SIZES[fmt];
        const page = await browser.newPage({ viewport: { width, height } });
        for (const [id, slide] of Object.entries(slides)) {
          const doc = slideHtml(slide, { fmt, lang: script.lang, chapter: slide.chapter || '', shortTitle: fmt === 'portrait' && id !== 'end' ? shortTitle : '' });
          await page.setContent(doc, { waitUntil: 'load' });
          await page.evaluate(() => document.fonts.ready);
          const where = `${ep.slug} ${id} ${fmt}`;
          for (const c of offBrandColours(doc)) problems.push(`${where}: colour ${c}`);
          for (const p of await layoutProblems(page)) problems.push(`${where}: ${p}`);
          for (const p of await brandProblems(page, await page.screenshot())) problems.push(`${where}: ${p}`);
        }
        await page.close();
      }
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await page.setContent(thumbnailHtml(ep.thumbnail, { lang: ep.lang }), { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      for (const p of await brandProblems(page, await page.screenshot())) problems.push(`${ep.slug} thumbnail: ${p}`);
      await page.close();
    }
  } finally { await browser.close(); }
  assert.deepEqual(problems, []);
});

test('speech spans merge across short gaps, so the bed does not pump between sentences', () => {
  assert.deepEqual(mergeSpans([[0, 2], [2.5, 4], [7, 8]]), [[0, 4], [7, 8]]);
  assert.equal(pickLongBed('a').track.id, pickLongBed('a').track.id);
});

test('the mix: -14 LUFS, true peak under -1 dBTP, bed ducked 15 LU or more under the voice, music on the end screen', () => {
  const dir = mkdtempSync(join(tmpdir(), 'devya-ytmix-'));
  try {
    // "Speech": a voiced buzz in two blocks, then a 12 s end screen.
    const clip = join(dir, 'clip.wav');
    spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', "aevalsrc='0.3*sin(2*PI*140*t)*(0.6+0.4*sin(2*PI*4*t))+0.1*sin(2*PI*700*t)':s=48000:d=9", '-ac', '1', clip]);
    const duration = 34;
    const narration = join(dir, 'narration.wav');
    layNarration([{ file: clip, t: 0.4 }, { file: clip, t: 10 }], duration, narration);
    const out = join(dir, 'mix.wav');
    const mix = mixVideo({ slug: 'test', narration, duration, speech: [[0.4, 9.4], [10, 19]], out });
    const video = join(dir, 'v.mp4');
    spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=black:s=320x180:d=${duration}`, '-i', out, '-c:v', 'libx264', '-c:a', 'aac', '-b:a', '192k', '-shortest', video]);
    assert.deepEqual(soundProblems(video, mix, { duration, endCard: 12 }), []);
    assert.ok(mix.voiceLevel - mix.bedUnderSpeech >= 15, `${mix.voiceLevel} vs ${mix.bedUnderSpeech}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
