#!/usr/bin/env node
// Writes social/calendar.md, the human-readable view of calendar.json
// (full copy, language, time and visual for every network and day).
// calendar.json stays the source of truth; never edit calendar.md by hand.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOCIAL = join(dirname(fileURLToPath(import.meta.url)), '..');
const cal = JSON.parse(readFileSync(join(SOCIAL, 'calendar.json'), 'utf8'));
const NET = { linkedin: 'LinkedIn', facebook: 'Facebook', instagram: 'Instagram' };
const LANG = { en: 'English', ar: 'Arabic' };
const dow = (date) => new Date(date + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

const out = [
  '# Devya social calendar',
  '',
  `Generated from \`calendar.json\` by \`render/build-md.mjs\`. Edit the JSON, not this file. Times are ${cal.timezone}.`,
  `Slots: LinkedIn ${cal.slots.linkedin}, Facebook ${cal.slots.facebook}, Instagram ${cal.slots.instagram}.`,
  '',
  '| Day | Date | Pillar | Layout | Topic | FB / IG language |',
  '|---|---|---|---|---|---|',
  ...cal.days.map((d) => `| ${d.day} | ${dow(d.date)} | ${d.pillar} | ${d.layout} | ${d.skip ? '~~' + d.topic + '~~ (skip)' : d.topic} | ${d.posts.facebook.lang.toUpperCase()} / ${d.posts.instagram.lang.toUpperCase()} |`),
  '',
];

for (const d of cal.days) {
  out.push(`## Day ${d.day} · ${dow(d.date)} · ${d.topic}${d.skip ? ' (SKIPPED)' : ''}`, '');
  out.push(`Pillar **${d.pillar}** · layout **${d.layout}** · accent ${d.accent} · source ${d.source}`, '');
  if (d.basis) out.push(`Basis: ${d.basis}`, '');
  for (const net of ['linkedin', 'facebook', 'instagram']) {
    const p = d.posts[net];
    const [w, h] = cal.sizes[net];
    out.push(`### ${NET[net]} · ${cal.slots[net]} · ${LANG[p.lang]}`, '');
    out.push(`<img src="visuals/${d.date}/${net}.png" alt="${NET[net]} card, ${d.date}" width="${net === 'linkedin' ? 480 : 320}"> \`${w}×${h}\``, '');
    out.push('```text', p.caption, '```', '');
  }
}
writeFileSync(join(SOCIAL, 'calendar.md'), out.join('\n'));
console.log(`wrote calendar.md (${cal.days.length} days)`);
