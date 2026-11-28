#!/usr/bin/env node
// Validates social/calendar.json against the strategy's quality gate
// (social/STRATEGY.md § Quality gate) and the link/SEO/brand rules in seo.mjs.
// Exits 1 on any error, so CI, the top-up merge and the routine's pre-publish
// gate all refuse a day with an untagged, off-site or Vercel link.
//
//   node validate.mjs                 check every day
//   node validate.mjs --date D        report only day D's problems (the routine's gate)
//   node validate.mjs --images        also require each day's three PNGs
//   node validate.mjs --live          also fetch every linked page: it must answer
//                                     200 directly (no redirect, no error), and each
//                                     project page must still list the project link
//                                     the posts use (social/projects.json)
//   node validate.mjs --calendar F    validate file F instead of social/calendar.json
//   node validate.mjs --youtube F     check YouTube registry F instead of social/youtube/episodes.json
//
// The YouTube episodes (social/youtube/episodes.json) are checked too:
// titles, descriptions as composed, tags, hashtags, one upload a day, and the
// same link rule (a devya.dev link, the project's own link, UTM-tagged
// utm_source=youtube&utm_medium=video, never Vercel): youtube/youtube.mjs.
//
// Days before seo.RULES_FROM (2026-11-28) were published under the older rules
// (no utm_campaign, Instagram 5-8 hashtags, Facebook none, per-pillar accent
// colours) and are checked against those, so the published record stays as is.
// From RULES_FROM on, every caption (feed posts and videos, every network,
// plain text on Instagram) carries a devya.dev link, plus the project's own
// link on a day about a project (seo.requiredLinkProblems): the routine's
// pre-publish gate (--date) holds the day when either is missing.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { shotUrlProblem } from './shot-guard.mjs';
import { youtubeProblems, registryLinks } from '../youtube/youtube.mjs';
import { RULES_FROM, POST_TAGS, REEL_TAGS, BRAND_TAG, CHANNEL, DEVYA_VIDEOS, PROJECT_LINKS, campaignSlug, captionLinks, linkProblems, linkBase, allowedPages, hashtags, keywordLed, namingProblems, altText, altProblems, youtubeId, videoUrl, isYouTubeHost, isDevyaHost, isProjectLink, projectSlug, requiredLinkProblems } from './seo.mjs';

const SOCIAL = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
// --calendar <file> validates another file (tests use fixtures).
const cal = JSON.parse(readFileSync(args.includes('--calendar') ? args[args.indexOf('--calendar') + 1] : join(SOCIAL, 'calendar.json'), 'utf8'));
const checkImages = args.includes('--images');
const live = args.includes('--live');
const only = args.includes('--date') ? args[args.indexOf('--date') + 1] : null;

const PILLARS = ['client-value', 'engineering', 'product', 'bts', 'case-study', 'culture'];
const LAYOUTS = ['statement', 'checklist', 'code', 'terminal', 'compare', 'product'];
const LEGACY_ACCENTS = ['ember', 'azure', 'lime'];
const NETS = ['linkedin', 'facebook', 'instagram'];
const MAX_LEN = { linkedin: 3000, facebook: 5000, instagram: 2200 };
const MIN_LEN = { linkedin: 400, facebook: 150, instagram: 80 };
const LEGACY_TAGS = { linkedin: [3, 5], facebook: [0, 0], instagram: [5, 8] };
const LEGACY_REEL_TAGS = { linkedin: [1, 3], facebook: [0, 0], instagram: [3, 6] };
const BANNED = /devya\.solutions|devya\.com\b|driftcode|best-in-class|passionate|innovative/i;
const ARABIC = /[؀-ۿ]/g;
const LATIN = /[A-Za-z]/g;

const errors = [];
const err = (d, m) => errors.push({ date: d?.date ?? '?', msg: m });
const pages = new Map(); // link base -> first day that uses it (for --live)
const listed = new Map(); // project page -> {link, date}: the page must list the link (for --live)

let prev = '';
const topics = [];
cal.days.forEach((d, i) => {
  const modern = d.date >= RULES_FROM;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) err(d, 'bad date');
  if (d.date <= prev) err(d, 'dates must be strictly increasing');
  prev = d.date;
  if (!PILLARS.includes(d.pillar)) err(d, `unknown pillar ${d.pillar}`);
  if (!LAYOUTS.includes(d.layout)) err(d, `unknown layout ${d.layout}`);
  // Black and silver only (2026-11-28): the per-pillar ember/azure/lime accents are retired.
  if (modern && d.accent !== undefined) err(d, `accent "${d.accent}": remove it, the theme is black and silver for every day`);
  if (!modern && !LEGACY_ACCENTS.includes(d.accent)) err(d, `unknown accent ${d.accent}`);
  if (!d.topic) err(d, 'missing topic');
  if (!/^https:\/\/www\.devya\.dev\//.test(d.source || '')) err(d, 'source must be a www.devya.dev URL');
  if (typeof d.linkedinLink !== 'boolean') err(d, 'linkedinLink must be true/false');

  // No topic repeats within 14 days.
  const recent = topics.slice(-13);
  if (recent.includes(String(d.topic).toLowerCase())) err(d, 'topic repeats within 14 days');
  topics.push(String(d.topic).toLowerCase());

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
    if (modern) for (const p of namingProblems(JSON.stringify(t))) err(d, `card.${lang}: ${p}`);
  }
  if (d.layout === 'code' && !c.code?.length) err(d, 'code layout needs card.code');
  if (d.layout === 'terminal' && !c.terminal?.length) err(d, 'terminal layout needs card.terminal');
  if (d.layout === 'product' && !/^https:\/\//.test(c.shot || '')) err(d, 'product layout needs card.shot URL');
  if (d.layout === 'product' && c.shot && shotUrlProblem(c.shot)) err(d, `card.shot: ${shotUrlProblem(c.shot)}`);
  // Vercel is banned (2026-11-27): no vercel.app / now.sh URL or label anywhere in a day.
  const vercel = JSON.stringify(d).match(/[\w.-]*\b(vercel\.app|now\.sh)\b[^"\s]*/i);
  if (vercel) err(d, `Vercel URL ${vercel[0]} (Vercel is banned; use the app's own devya.dev host)`);

  // SEO: keywords per language; every caption's first line leads with one.
  const kw = d.keywords || {};
  if (modern && !(kw.en?.length && kw.ar?.length)) err(d, 'keywords needs en and ar lists (the search terms each caption leads with)');
  const campaign = campaignSlug(d);
  // A day about a video (day.video) links that video, and only a Devya-channel one.
  if (d.video !== undefined) {
    const id = youtubeId(d.video);
    if (!DEVYA_VIDEOS.has(id) || d.video !== videoUrl(id)) err(d, `video ${d.video} must be ${id ? videoUrl(id) : 'a canonical watch URL'} of a video on Devya's channel (social/videos.json)`);
  }
  const okPages = allowedPages(d);
  if (modern && projectSlug(d) && PROJECT_LINKS.has(projectSlug(d))) listed.set(linkBase(d.source), { link: PROJECT_LINKS.get(projectSlug(d)), date: d.date });

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
    const tags = hashtags(s);
    const [lo, hi] = (modern ? POST_TAGS : LEGACY_TAGS)[net];
    if (tags.length < lo || tags.length > hi) err(d, `${net}: ${tags.length} hashtags, want ${lo}-${hi}`);
    const urls = captionLinks(s);
    if (modern) {
      if (!tags.includes(BRAND_TAG)) err(d, `${net}: hashtags must include ${BRAND_TAG}`);
      if (!keywordLed(s, kw[post.lang])) err(d, `${net}: first line must lead with one of the day's ${post.lang} keywords (${(kw[post.lang] || []).join(', ')})`);
      for (const pr of namingProblems(s)) err(d, `${net}: ${pr}`);
      for (const url of urls) {
        for (const pr of linkProblems(url, { platform: net, campaign })) err(d, `${net}: ${pr}`);
        if (!okPages.has(linkBase(url))) err(d, `${net}: ${linkBase(url)} is not this day's page (source, /contact, the product shown, or day.links)`);
        if (!pages.has(linkBase(url))) pages.set(linkBase(url), d.date);
      }
      for (const pr of requiredLinkProblems(d, s)) err(d, `${net}: ${pr}`);
      for (const pr of altProblems(altText(d, post.lang))) err(d, `${net}: ${pr}`);
    } else {
      for (const url of urls) {
        if (!url.startsWith('https://www.devya.dev/')) err(d, `${net}: link outside www.devya.dev: ${url}`);
        if (!url.includes(`utm_source=${net}&utm_medium=social`)) err(d, `${net}: link missing utm_source=${net}&utm_medium=social`);
      }
    }
    if (net === 'linkedin' && d.linkedinLink !== (urls.length > 0)) err(d, `linkedin: linkedinLink=${d.linkedinLink} but ${urls.length} link(s)`);
    if (modern && urls.length > 3) err(d, `${net}: ${urls.length} links, at most 3 (the project's link, a devya.dev page, the video)`);
    if (modern && d.video && (net === 'facebook' || net === 'linkedin') && !urls.some((u) => linkBase(u) === linkBase(d.video))) err(d, `${net}: a video day links its video (${d.video})`);
    // Older days said "link in bio" on Instagram; since RULES_FROM the links go in as plain text.
    if (!modern && net === 'instagram' && urls.length) err(d, 'instagram: links are not clickable, say "link in bio"');
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
    if (modern) for (const lang of ['en', 'ar']) {
      if (!keywordLed(d.reel[lang], kw[lang])) err(d, `reel.${lang}: must lead with one of the day's ${lang} keywords`);
      for (const pr of namingProblems(d.reel[lang])) err(d, `reel.${lang}: ${pr}`);
    }
  }
  const r = d.reels || {};
  if (r.linkedin?.lang !== 'en') err(d, 'reels.linkedin must be English');
  if (r.facebook?.lang !== p.facebook?.lang || r.instagram?.lang !== p.instagram?.lang) err(d, 'reels must match the day\'s Facebook/Instagram languages');
  if (d.stories?.facebook?.lang !== p.facebook?.lang || d.stories?.instagram?.lang !== p.instagram?.lang) err(d, 'stories must match the day\'s Facebook/Instagram languages');
  for (const net of NETS) {
    const cap = r[net]?.caption || '';
    const [lo, hi] = (modern ? REEL_TAGS : LEGACY_REEL_TAGS)[net];
    const n = hashtags(cap).length;
    if (n < lo || n > hi) err(d, `reels.${net}: ${n} hashtags, want ${lo}-${hi}`);
    if (modern) for (const pr of requiredLinkProblems(d, cap)) err(d, `reels.${net}: ${pr}`);
    for (const url of captionLinks(cap)) {
      if (modern) {
        for (const pr of linkProblems(url, { platform: net, campaign, content: 'reel' })) err(d, `reels.${net}: ${pr}`);
        if (!okPages.has(linkBase(url))) err(d, `reels.${net}: ${linkBase(url)} is not this day's page`);
        if (!pages.has(linkBase(url))) pages.set(linkBase(url), d.date);
      } else if (net !== 'facebook' || !url.startsWith('https://www.devya.dev/') || !url.includes('utm_source=facebook&utm_medium=social')) err(d, `reels.${net}: bad link ${url}`);
    }
  }
});

// YouTube episodes: the same rules for every title, description and link.
const ytFile = args.includes('--youtube') ? args[args.indexOf('--youtube') + 1] : join(SOCIAL, 'youtube', 'episodes.json');
let ytCount = 0;
if (existsSync(ytFile)) {
  const reg = JSON.parse(readFileSync(ytFile, 'utf8'));
  ytCount = reg.episodes.length;
  for (const p of youtubeProblems(reg)) err({ date: p.where }, `youtube ${p.slug}: ${p.msg}`);
  for (const [page, date] of registryLinks(reg)) if (!pages.has(page)) pages.set(page, date);
  for (const ep of reg.episodes) {
    if (ep.project && PROJECT_LINKS.has(ep.project) && /^https:\/\/www\.devya\.dev\/projects\//.test(ep.site || '')) listed.set(linkBase(ep.site), { link: PROJECT_LINKS.get(ep.project), date: (ep.publishAt || '').slice(0, 10) });
  }
}

// curl rather than fetch: no redirect following, and it copes with this Mac's
// dual-stack DNS where Node's fetch can time out connecting.
if (live) {
  for (const [page, date] of pages) {
    if (only && date !== only) continue;
    // A YouTube watch page answers 200 even for a removed video: ask oEmbed,
    // which answers 200 only for a playable public/unlisted video, and check
    // that the video belongs to Devya's channel.
    if (isYouTubeHost(new URL(page).hostname)) {
      const r = spawnSync('curl', ['-sS', '-m', '25', '--retry', '2', '-w', '\n%{http_code}', `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(page)}`], { encoding: 'utf8' });
      const lines = (r.stdout || '').trim().split('\n');
      const code = lines.pop();
      let meta = {};
      try { meta = JSON.parse(lines.join('\n')); } catch { /* not JSON: reported below */ }
      if (r.status !== 0) err({ date }, `${page} could not be checked: ${(r.stderr || '').trim()}`);
      else if (code !== '200') err({ date }, `${page} is not available on YouTube (oEmbed HTTP ${code})`);
      else if (!String(meta.author_url || '').endsWith(`/${CHANNEL.handle}`)) err({ date }, `${page} belongs to ${meta.author_url}, not ${CHANNEL.url}`);
      continue;
    }
    // A project's own app (projects.json, off devya.dev) is linked exactly as its
    // devya.dev page lists it; it may redirect within its own host (a locale
    // page such as /ar) as long as it lands on a 200.
    const host = new URL(page).hostname;
    if (!isDevyaHost(host) && isProjectLink(page)) {
      const pr = spawnSync('curl', ['-sS', '-L', '--max-redirs', '5', '-o', '/dev/null', '-m', '25', '--retry', '2', '-A', 'devya-social-validate', '-w', '%{http_code} %{url_effective}', page], { encoding: 'utf8' });
      const [code, final] = (pr.stdout || '').trim().split(' ');
      if (pr.status !== 0) err({ date }, `${page} could not be fetched: ${(pr.stderr || '').trim()}`);
      else if (code !== '200') err({ date }, `${page} answers HTTP ${code}`);
      else if (new URL(final).hostname !== host) err({ date }, `${page} redirects off its host to ${final}`);
      continue;
    }
    const r = spawnSync('curl', ['-sS', '-o', '/dev/null', '-m', '25', '--retry', '2', '-A', 'devya-social-validate', '-w', '%{http_code} %{redirect_url}', page], { encoding: 'utf8' });
    const [code, location] = (r.stdout || '').trim().split(' ');
    if (r.status !== 0) err({ date }, `${page} could not be fetched: ${(r.stderr || '').trim()}`);
    else if (/^3/.test(code)) err({ date }, `${page} redirects (${code}) to ${location}: link the final page`);
    else if (code !== '200') err({ date }, `${page} answers HTTP ${code}`);
  }
}

// Each project page must still list the link the posts give for the project.
if (live) {
  for (const [page, { link, date }] of listed) {
    if (only && date !== only) continue;
    const r = spawnSync('curl', ['-sS', '-m', '25', '--retry', '2', '-A', 'devya-social-validate', page], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    if (r.status !== 0) { err({ date }, `${page} could not be fetched: ${(r.stderr || '').trim()}`); continue; }
    const hrefs = [...(r.stdout || '').matchAll(/href="(https?:\/\/[^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
    if (!hrefs.some((h) => { try { return linkBase(h) === linkBase(link); } catch { return false; } })) err({ date }, `${page} no longer lists ${link}: update social/projects.json to the link the page shows`);
  }
}

const shown = only ? errors.filter((e) => e.date === only) : errors;
if (only && !cal.days.some((d) => d.date === only)) console.log(`(no calendar day ${only})`);
if (shown.length) {
  console.error(shown.map((e) => `✗ ${e.date}: ${e.msg}`).join('\n'));
  console.error(`\n${shown.length} problem(s) in calendar.json or the YouTube episodes${only ? ` for ${only}` : ''}`);
  process.exit(1);
}
console.log(`✓ calendar.json: ${only ? `${only} passes` : `${cal.days.length} days pass`} the quality gate${checkImages ? ' (images present)' : ''}${live ? ' (linked pages answer 200)' : ''}${ytCount && !only ? `; ${ytCount} YouTube episodes pass` : ''}`);
