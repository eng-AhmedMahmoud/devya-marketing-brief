#!/usr/bin/env node
// Prints what the daily social routine should publish right now, as JSON.
// A network is due when today's calendar day exists, is not skipped, its
// Cairo slot time has passed, and state.json has no record for it yet.
// Past days are never published late (a missed day is logged, not doubled up).
//
//   node due.mjs [--now 2026-11-16T19:45] [--only linkedin,facebook]
//
// Output: {"date","day","remaining","due":[{network,lang,caption,image}],"skipped":bool}

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOCIAL = join(dirname(fileURLToPath(import.meta.url)), '..');
const cal = JSON.parse(readFileSync(join(SOCIAL, 'calendar.json'), 'utf8'));
const statePath = join(SOCIAL, 'state.json');
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { published: {} };

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };

// Wall-clock in Cairo, independent of the Mac's timezone.
function cairoNow() {
  if (opt('--now')) { const [d, t] = opt('--now').split('T'); return { date: d, time: t.slice(0, 5) }; }
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: cal.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}` };
}

const now = cairoNow();
const only = opt('--only') ? opt('--only').split(',') : null;
const day = cal.days.find((d) => d.date === now.date);
const remaining = cal.days.filter((d) => d.date > now.date).length;
const done = state.published?.[now.date] || {};

const due = [];
if (day && !day.skip) {
  for (const [network, post] of Object.entries(day.posts)) {
    if (only && !only.includes(network)) continue;
    if (done[network]?.url) continue;
    if (now.time < cal.slots[network]) continue;
    const t = day.card[post.lang];
    const detail = t.sub || (t.items || t.right?.items || []).join(', ');
    const alt = `${post.lang === 'ar' ? 'بطاقة من ديفيا' : 'Devya card'}: ${t.title.replace(/\*/g, '')}${detail ? ` ${detail.replace(/\*/g, '')}` : ''}`;
    due.push({
      network, lang: post.lang, caption: post.caption, alt,
      image: join(SOCIAL, 'visuals', day.date, `${network}.png`),
      account: cal.accounts[network],
    });
  }
}

console.log(JSON.stringify({ now, date: now.date, day: day?.day ?? null, topic: day?.topic ?? null, skipped: !!day?.skip, remaining, lastDate: cal.days.at(-1)?.date, due }, null, 2));
