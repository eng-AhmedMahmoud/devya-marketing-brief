#!/usr/bin/env node
// Prints what the daily social routine should publish right now, as JSON.
// A network is due when today's calendar day exists, is not skipped, its
// Cairo slot time has passed, and state.json has no record for it yet.
// Past days are never published late (a missed day is logged, not doubled up).
//
//   node due.mjs [--now 2026-11-16T19:45] [--only linkedin,facebook]
//
// Output: {date, day, remaining, held:[{network,reason}], due:[{network,platform,kind,lang,caption,media,cover?,alt?}]}

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

// Every publish channel of a day: feed posts (PNG), the day's vertical video as
// LinkedIn video / Facebook + Instagram Reels (MP4), and the same video as Stories.
const KIND = { linkedin: 'post', facebook: 'post', instagram: 'post', linkedin_video: 'video', facebook_reel: 'reel', instagram_reel: 'reel', facebook_story: 'story', instagram_story: 'story' };
const paused = cal.pausedChannels || {};
const due = [];
const held = [];
if (day && !day.skip) {
  const vid = (lang) => join(SOCIAL, 'visuals', day.date, `reel-${lang}.mp4`);
  const altFor = (lang) => {
    const t = day.card[lang];
    const detail = t.sub || (t.items || t.right?.items || []).join(', ');
    return `${lang === 'ar' ? 'بطاقة من ديفيا' : 'Devya card'}: ${t.title.replace(/\*/g, '')}${detail ? ` ${detail.replace(/\*/g, '')}` : ''}`;
  };
  const channels = [];
  for (const [net, post] of Object.entries(day.posts)) channels.push({ network: net, platform: net, lang: post.lang, caption: post.caption, media: join(SOCIAL, 'visuals', day.date, `${net}.png`), alt: altFor(post.lang) });
  for (const [net, reel] of Object.entries(day.reels || {})) {
    const key = net === 'linkedin' ? 'linkedin_video' : `${net}_reel`;
    channels.push({ network: key, platform: net, lang: reel.lang, caption: reel.caption, media: vid(reel.lang), cover: vid(reel.lang).replace(/\.mp4$/, '-cover.jpg') });
  }
  for (const [net, story] of Object.entries(day.stories || {})) channels.push({ network: `${net}_story`, platform: net, lang: story.lang, caption: null, media: vid(story.lang) });
  for (const ch of channels) {
    if (only && !only.includes(ch.network)) continue;
    if (done[ch.network]?.url) continue;
    if (now.time < (cal.slots[ch.network] || '23:59')) continue;
    if (paused[ch.network]) { held.push({ network: ch.network, reason: paused[ch.network] }); continue; }
    due.push({ ...ch, kind: KIND[ch.network], account: cal.accounts[ch.platform] });
  }
}

console.log(JSON.stringify({ now, date: now.date, day: day?.day ?? null, topic: day?.topic ?? null, skipped: !!day?.skip, remaining, lastDate: cal.days.at(-1)?.date, held, due }, null, 2));
