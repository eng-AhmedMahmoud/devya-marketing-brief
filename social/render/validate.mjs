#!/usr/bin/env node
// Validates social/calendar.json against the strategy's quality gate
// (social/STRATEGY.md § Quality gate). Exits 1 on any error.
//
//   node validate.mjs            check every day
//   node validate.mjs --images   also require each day's three PNGs

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOCIAL = join(dirname(fileURLToPath(import.meta.url)), '..');
const cal = JSON.parse(readFileSync(join(SOCIAL, 'calendar.json'), 'utf8'));
const checkImages = process.argv.includes('--images');

const PILLARS = ['client-value', 'engineering', 'product', 'bts', 'case-study', 'culture'];
const LAYOUTS = ['statement', 'checklist', 'code', 'terminal', 'compare', 'product'];
const ACCENTS = ['ember', 'azure', 'lime'];
const NETS = ['linkedin', 'facebook', 'instagram'];
const MAX_LEN = { linkedin: 3000, facebook: 5000, instagram: 2200 };
const MIN_LEN = { linkedin: 400, facebook: 150, instagram: 80 };
const TAGS = { linkedin: [3, 5], facebook: [0, 0], instagram: [5, 8] };
const BANNED = /devya\.solutions|devya\.com\b|driftcode|best-in-class|passionate|innovative/i;
const ARABIC = /[؀-ۿ]/g;
const LATIN = /[A-Za-z]/g;

const errors = [];
const err = (d, m) => errors.push(`${d?.date ?? '?'}: ${m}`);

let prev = '';
const topics = [];
cal.days.forEach((d, i) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) err(d, 'bad date');
  if (d.date <= prev) err(d, 'dates must be strictly increasing');
  prev = d.date;
  if (!PILLARS.includes(d.pillar)) err(d, `unknown pillar ${d.pillar}`);
  if (!LAYOUTS.includes(d.layout)) err(d, `unknown layout ${d.layout}`);
  if (!ACCENTS.includes(d.accent)) err(d, `unknown accent ${d.accent}`);
  if (!d.topic) err(d, 'missing topic');
  if (!/^https:\/\/www\.devya\.dev\//.test(d.source || '')) err(d, 'source must be a www.devya.dev URL');
  if (typeof d.linkedinLink !== 'boolean') err(d, 'linkedinLink must be true/false');

  // No topic repeats within 14 days.
  const recent = topics.slice(-13);
  if (recent.includes(d.topic.toLowerCase())) err(d, 'topic repeats within 14 days');
  topics.push(d.topic.toLowerCase());

  // Layout at most twice in any 7-day window; product posts at most 2 in any 5 days.
  const win7 = cal.days.slice(Math.max(0, i - 6), i + 1);
  if (win7.filter((x) => x.layout === d.layout).length > 2) err(d, `layout ${d.layout} used more than twice in 7 days`);
  const win5 = cal.days.slice(Math.max(0, i - 4), i + 1);
  if (win5.filter((x) => x.pillar === 'product').length > 2) err(d, 'more than 2 product posts in 5 days');

  // Card text for both languages, with the fields the layout needs.
  const c = d.card || {};
  for (const lang of ['en', 'ar']) {
    const t = c[lang];
    if (!t?.kicker || !t?.title) { err(d, `card.${lang} needs kicker and title`); continue; }
    if (['checklist'].includes(d.layout) && !(t.items?.length >= 3 && t.items.length <= 6)) err(d, `card.${lang}.items needs 3-6 entries`);
    if (d.layout === 'compare' && !(t.left?.items?.length && t.right?.items?.length)) err(d, `card.${lang} needs left/right`);
    if (lang === 'ar' && d.layout !== 'product' && !(t.title.match(ARABIC) || []).length) err(d, 'card.ar.title has no Arabic');
  }
  if (d.layout === 'code' && !c.code?.length) err(d, 'code layout needs card.code');
  if (d.layout === 'terminal' && !c.terminal?.length) err(d, 'terminal layout needs card.terminal');
  if (d.layout === 'product' && !/^https:\/\//.test(c.shot || '')) err(d, 'product layout needs card.shot URL');

  // Posts.
  const p = d.posts || {};
  if (p.linkedin?.lang !== 'en') err(d, 'linkedin must be English');
  if (p.facebook?.lang === p.instagram?.lang) err(d, 'facebook and instagram must ship opposite languages');
  // Facebook Arabic by default, English on Tue and Sat (Instagram the opposite).
  const dow = new Date(d.date + 'T12:00:00Z').getUTCDay();
  const fbLang = dow === 2 || dow === 6 ? 'en' : 'ar';
  if (p.facebook?.lang !== fbLang) err(d, `facebook should be ${fbLang} on this weekday`);
  for (const net of NETS) {
    const post = p[net];
    if (!post?.caption) { err(d, `${net}: missing caption`); continue; }
    const s = post.caption;
    if (s.length > MAX_LEN[net]) err(d, `${net}: caption ${s.length} chars > ${MAX_LEN[net]}`);
    if (s.length < MIN_LEN[net]) err(d, `${net}: caption under ${MIN_LEN[net]} chars`);
    if (BANNED.test(s)) err(d, `${net}: banned word or domain`);
    if (/@\w/.test(s.replace(/@devyasoftware/g, ''))) err(d, `${net}: @-mention (no tagging)`);
    const tags = s.match(/(^|\s)#[\p{L}\p{N}_]+/gu) || [];
    const [lo, hi] = TAGS[net];
    if (tags.length < lo || tags.length > hi) err(d, `${net}: ${tags.length} hashtags, want ${lo}-${hi}`);
    const urls = s.match(/https?:\/\/\S+/g) || [];
    for (const url of urls) {
      if (!url.startsWith('https://www.devya.dev/')) err(d, `${net}: link outside www.devya.dev: ${url}`);
      if (!url.includes(`utm_source=${net}&utm_medium=social`)) err(d, `${net}: link missing utm_source=${net}&utm_medium=social`);
    }
    if (net === 'linkedin' && d.linkedinLink !== (urls.length > 0)) err(d, `linkedin: linkedinLink=${d.linkedinLink} but ${urls.length} link(s)`);
    if (net === 'instagram' && urls.length) err(d, 'instagram: links are not clickable, say "link in bio"');
    const body = s.replace(/#[\p{L}\p{N}_]+/gu, '').replace(/https?:\/\/\S+/g, '');
    const ar = (body.match(ARABIC) || []).length;
    const la = (body.match(LATIN) || []).length;
    if (post.lang === 'ar' && ar < la * 2) err(d, `${net}: Arabic caption is not mostly Arabic`);
    if (post.lang === 'en' && ar > 0) err(d, `${net}: English caption contains Arabic (never blob both languages)`);
    if (checkImages && !existsSync(join(SOCIAL, 'visuals', d.date, `${net}.png`))) err(d, `${net}: image missing`);
  }

  // Vertical video: one-liner per language, composed reels, stories in the feed languages.
  if (!d.reel?.en || !d.reel?.ar) err(d, 'reel needs en and ar one-liners');
  else {
    if ((d.reel.en.match(ARABIC) || []).length) err(d, 'reel.en contains Arabic');
    if (!(d.reel.ar.match(ARABIC) || []).length) err(d, 'reel.ar has no Arabic');
    if (d.reel.en.length > 160 || d.reel.ar.length > 160) err(d, 'reel one-liner over 160 chars');
    if (BANNED.test(d.reel.en + d.reel.ar)) err(d, 'reel: banned word or domain');
  }
  const r = d.reels || {};
  if (r.linkedin?.lang !== 'en') err(d, 'reels.linkedin must be English');
  if (r.facebook?.lang !== p.facebook?.lang || r.instagram?.lang !== p.instagram?.lang) err(d, 'reels must match the day\'s Facebook/Instagram languages');
  if (d.stories?.facebook?.lang !== p.facebook?.lang || d.stories?.instagram?.lang !== p.instagram?.lang) err(d, 'stories must match the day\'s Facebook/Instagram languages');
  for (const [net, lo, hi] of [['linkedin', 1, 3], ['facebook', 0, 0], ['instagram', 3, 6]]) {
    const cap = r[net]?.caption || '';
    const n = (cap.match(/(^|\s)#[\p{L}\p{N}_]+/gu) || []).length;
    if (n < lo || n > hi) err(d, `reels.${net}: ${n} hashtags, want ${lo}-${hi}`);
    for (const url of cap.match(/https?:\/\/\S+/g) || []) {
      if (net !== 'facebook' || !url.startsWith('https://www.devya.dev/') || !url.includes('utm_source=facebook&utm_medium=social')) err(d, `reels.${net}: bad link ${url}`);
    }
  }
});

if (errors.length) {
  console.error(errors.map((e) => `✗ ${e}`).join('\n'));
  console.error(`\n${errors.length} problem(s) in calendar.json`);
  process.exit(1);
}
console.log(`✓ calendar.json: ${cal.days.length} days pass the quality gate${checkImages ? ' (images present)' : ''}`);
