#!/usr/bin/env node
// Merges top-up days drafted by the top-up worker (social/inbox/new-days.json)
// into calendar.json, then validates, renders and rebuilds calendar.md.
// All or nothing: on any failure calendar.json is restored and the new
// visuals are removed, so a bad draft never reaches the publish step.
//
//   node merge-days.mjs [path/to/new-days.json]

import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { composeReels } from '../render/compose.mjs';

const SOCIAL = join(dirname(fileURLToPath(import.meta.url)), '..');
const RENDER = join(SOCIAL, 'render');
const calPath = join(SOCIAL, 'calendar.json');
const inbox = process.argv[2] || join(SOCIAL, 'inbox', 'new-days.json');

if (!existsSync(inbox)) { console.error(`merge: ${inbox} not found`); process.exit(1); }
const original = readFileSync(calPath, 'utf8');
const cal = JSON.parse(original);
const draft = JSON.parse(readFileSync(inbox, 'utf8'));
const days = Array.isArray(draft) ? draft : draft.days;
if (!Array.isArray(days) || !days.length) { console.error('merge: no days in draft'); process.exit(1); }

const next = (date) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
let expect = next(cal.days.at(-1).date);
const added = [];
for (const d of days) {
  if (d.date !== expect) { console.error(`merge: expected ${expect}, draft has ${d.date}`); process.exit(1); }
  if (!d.reel?.en || !d.reel?.ar || !d.posts) { console.error(`merge: ${d.date} needs reel.en, reel.ar and posts`); process.exit(1); }
  added.push({ ...d, day: cal.days.length + added.length + 1, skip: false, ...composeReels(d) });
  expect = next(expect);
}

const run = (script, args = []) => spawnSync(process.execPath, [join(RENDER, script), ...args], { stdio: 'inherit' }).status;
const restore = (why) => {
  writeFileSync(calPath, original);
  for (const d of added) rmSync(join(SOCIAL, 'visuals', d.date), { recursive: true, force: true });
  console.error(`merge: ${why}; calendar.json restored, nothing merged`);
  process.exit(1);
};

cal.days.push(...added);
writeFileSync(calPath, JSON.stringify(cal, null, 2) + '\n');
if (run('validate.mjs') !== 0) restore('validation failed');
for (const d of added) if (run('render.mjs', ['--date', d.date, '--force']) !== 0) restore(`render failed for ${d.date}`);
for (const d of added) if (run('render-reel.mjs', ['--date', d.date, '--force']) !== 0) restore(`reel render failed for ${d.date}`);
if (run('validate.mjs', ['--images']) !== 0) restore('images missing after render');
run('build-md.mjs');
rmSync(inbox, { force: true });
console.log(`merged ${added.length} day(s): ${added[0].date} → ${added.at(-1).date}`);
