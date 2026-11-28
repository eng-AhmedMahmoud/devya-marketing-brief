// Links and SEO rules for every caption the routine publishes.
//
// Links: https only, on www.devya.dev, a Devya product host (*.devya.dev), a
// project's own link as listed on its devya.dev page (social/projects.json) or
// a video on Devya's YouTube channel (social/videos.json, canonical
// https://www.youtube.com/watch?v=<id>), never Vercel, and tagged utm_source=<platform>&utm_medium=social&
// utm_campaign=<post slug> (+ utm_content=reel on video captions).
// Every caption (posts and videos, on every network; plain text on Instagram)
// carries a devya.dev link, and a post about a project also carries the
// project's own link (requiredLinkProblems, withRequiredLinks).
// Captions: keyword-led first line, platform-appropriate hashtags including
// #BuildWithDevya, "Devya" and product names spelled one way, alt text on images.
//
// validate.mjs applies these to every day from RULES_FROM on; days before it
// were published under the older rules and are left as the record.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isBannedHost } from './shot-guard.mjs';

const SOCIAL_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = JSON.parse(readFileSync(join(SOCIAL_DIR, 'videos.json'), 'utf8'));
// Devya's YouTube channel and the videos posts may link to.
export const CHANNEL = REGISTRY.channel;
export const DEVYA_VIDEOS = new Map(REGISTRY.videos.map((v) => [v.id, v]));
// Each devya.dev project page's own link (its live app or repository).
export const PROJECT_LINKS = new Map(Object.entries(JSON.parse(readFileSync(join(SOCIAL_DIR, 'projects.json'), 'utf8')).projects));
// www.devya.dev pages that now redirect, and where they went.
export const MOVED = { 'https://www.devya.dev/services': 'https://www.devya.dev/solutions' };

export const RULES_FROM = '2026-11-28';
export const PLATFORMS = ['linkedin', 'facebook', 'instagram'];
export const SITE = 'https://www.devya.dev';
export const BRAND_TAG = '#BuildWithDevya';
// [min, max] hashtags. Instagram caps posts and Reels at 5 since Dec 2025;
// Facebook takes a few relevant tags; LinkedIn 3-5 on posts.
export const POST_TAGS = { linkedin: [3, 5], facebook: [1, 3], instagram: [3, 5] };
export const REEL_TAGS = { linkedin: [1, 3], facebook: [1, 3], instagram: [3, 5] };
export const ALT_MAX = 250;
// One spelling for Devya and each product (as on devya.dev).
export const PRODUCTS = ['Devya Converse', 'X-Ray', 'CopyForge', 'ShotCraft', 'PlaceHarvest', 'AdGap', 'Urania', 'og-preview', 'jwt-inspector', 'cron-builder', 'contrast-check',
  'Moving POS', 'Moving Stores', 'Moving Loyalty', 'Moving Accounting', 'Moving Academy', 'Moving Systems'];

const kebab = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, ' ').replace(/[\s_-]+/g, '-').replace(/^-|-$/g, '');

// utm_campaign for a day: "<date>-<topic words>", at most 60 characters.
export function campaignSlug(day) {
  let slug = `${day.date}-${kebab(day.topic)}`;
  if (slug.length > 60) slug = slug.slice(0, 60).replace(/-[^-]*$/, '');
  return slug;
}

// Adds (or overwrites) the UTM tags, keeping any other query parameters.
export function tagUrl(url, { platform, campaign, content }) {
  const u = new URL(url);
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) u.searchParams.delete(k);
  u.searchParams.set('utm_source', platform);
  u.searchParams.set('utm_medium', 'social');
  u.searchParams.set('utm_campaign', campaign);
  if (content) u.searchParams.set('utm_content', content);
  return u.toString();
}

// URLs in a caption, without trailing punctuation (Latin, Arabic, curly quotes).
const URL_RE = /https?:\/\/[^\s)>\]»”’]+/g;
const TRAIL = /[.,;:!?'"،؛؟۔…]+$/u;
export const captionLinks = (text = '') => (String(text).match(URL_RE) || []).map((u) => u.replace(TRAIL, ''));

// Rewrites every URL in `text` in place with fn(url), leaving trailing punctuation.
export const mapLinks = (text, fn) => String(text).replace(URL_RE, (m) => {
  const url = m.replace(TRAIL, '');
  return fn(url) + m.slice(url.length);
});

export const isDevyaHost = (host) => host === 'www.devya.dev' || host === 'devya.dev' || /^[a-z0-9-]+\.devya\.dev$/.test(host);
export const isYouTubeHost = (host) => /^((www|m)\.)?youtube\.com$|^youtu\.be$/.test(host);

// The video id of a YouTube watch, shorts, embed or youtu.be link, else null.
export function youtubeId(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.hostname === 'youtu.be') return u.pathname.slice(1, 12) || null;
  if (!isYouTubeHost(u.hostname)) return null;
  if (u.pathname === '/watch') return u.searchParams.get('v');
  return (u.pathname.match(/^\/(shorts|embed|live)\/([\w-]{11})/) || [])[2] || null;
}
export const videoUrl = (id) => `https://www.youtube.com/watch?v=${id}`;

// The link without its query string, for "is this the right page" (a YouTube
// link keeps its video id).
export const linkBase = (url) => {
  const u = new URL(url);
  if (isYouTubeHost(u.hostname)) return videoUrl(youtubeId(url));
  return `${u.origin}${u.pathname.replace(/\/$/, '') || ''}`;
};

// A project's own link from social/projects.json, or a page under it (same
// host and path prefix): only those off-site links are allowed.
export function isProjectLink(url) {
  let base;
  try { base = linkBase(url); } catch { return false; }
  return [...PROJECT_LINKS.values()].some((p) => { const b = linkBase(p); return base === b || base.startsWith(`${b}/`); });
}

// Why a caption link is unfit, or [] when it is fine.
export function linkProblems(url, { platform, campaign, content } = {}) {
  let u;
  try { u = new URL(url); } catch { return [`not a valid URL: ${url}`]; }
  const out = [];
  if (u.protocol !== 'https:') out.push(`not https: ${url}`);
  if (isBannedHost(u.hostname)) out.push(`Vercel link ${url} (Vercel is banned)`);
  else if (isYouTubeHost(u.hostname)) {
    const id = youtubeId(url);
    if (!DEVYA_VIDEOS.has(id)) out.push(`YouTube link ${url} is not a video on Devya's channel (social/videos.json)`);
    else if (!(u.hostname === 'www.youtube.com' && u.pathname === '/watch')) out.push(`use the canonical ${videoUrl(id)} form: ${url}`);
  } else if (!isDevyaHost(u.hostname) && !isProjectLink(url)) out.push(`link outside devya.dev and the projects it lists (social/projects.json): ${url}`);
  const q = u.searchParams;
  if (!q.get('utm_source') && !q.get('utm_medium') && !q.get('utm_campaign')) out.push(`untagged link ${url}`);
  else {
    if (q.get('utm_source') !== platform) out.push(`utm_source should be ${platform}: ${url}`);
    if (q.get('utm_medium') !== 'social') out.push(`utm_medium should be social: ${url}`);
    if (q.get('utm_campaign') !== campaign) out.push(`utm_campaign should be ${campaign}: ${url}`);
    if (content && q.get('utm_content') !== content) out.push(`utm_content should be ${content}: ${url}`);
  }
  return out;
}

// The day with every devya.dev link and Devya-channel video link in its feed
// captions tagged for its network and the day's campaign (used by
// merge-days.mjs, so drafts can carry plain links; a youtu.be link becomes the
// canonical watch URL). Off-site and Vercel links are left as they are for the
// validator to reject.
export function tagDayLinks(day) {
  const campaign = campaignSlug(day);
  const posts = {};
  for (const [net, p] of Object.entries(day.posts || {})) {
    const caption = mapLinks(p.caption || '', (url) => {
      let host;
      try { host = new URL(url).hostname; } catch { return url; }
      if (isYouTubeHost(host)) { const id = youtubeId(url); return DEVYA_VIDEOS.has(id) ? tagUrl(videoUrl(id), { platform: net, campaign }) : url; }
      return (isDevyaHost(host) || isProjectLink(url)) && !isBannedHost(host) ? tagUrl(url, { platform: net, campaign }) : url;
    });
    posts[net] = { ...p, caption };
  }
  return { ...day, posts };
}

// The project a day is about: the slug of its www.devya.dev/projects/<slug>
// source page, else null (blog, service and company pages).
export const projectSlug = (day) => (String(day.source || '').match(/^https:\/\/www\.devya\.dev\/projects\/([\w-]+)\/?$/) || [])[1] || null;
// The project's own link as its devya.dev page lists it (social/projects.json);
// for a project page that lists none (a film), the day's video. Null when the
// day is not about a project, or the project is missing from the registry.
export const projectLink = (day) => { const slug = projectSlug(day); return slug ? PROJECT_LINKS.get(slug) || day.video || null : null; };
// The devya.dev page a caption links when it has none: the day's source page.
export const sitePage = (day) => MOVED[linkBase(day.source)] || linkBase(day.source);
const isSiteLink = (url) => { try { return ['www.devya.dev', 'devya.dev'].includes(new URL(url).hostname); } catch { return false; } };

// Why a caption lacks a required link, or []: every caption links a devya.dev
// page, and a caption about a project also links the project's own link.
export function requiredLinkProblems(day, caption) {
  const links = captionLinks(caption);
  const out = [];
  const slug = projectSlug(day);
  if (slug) {
    const p = projectLink(day);
    if (!p) out.push(`project "${slug}" has no link in social/projects.json (add the link ${SITE}/projects/${slug} lists)`);
    else if (!links.some((u) => linkBase(u) === linkBase(p))) out.push(`missing the project's link ${p} (as listed on ${SITE}/projects/${slug})`);
  }
  if (!links.some(isSiteLink)) out.push(`missing a devya.dev link (e.g. ${sitePage(day)})`);
  return out;
}

const isTagLine = (l) => /^\s*(#[\p{L}\p{N}_]+\s*)+$/u.test(l);
const LINK_LABEL = { en: { project: 'Project', site: 'Details' }, ar: { project: 'رابط المشروع', site: 'التفاصيل' } };
const LINK_IN_BIO = /\s*(link in bio|الرابط في البايو)\.?/giu;

// The caption with any missing required link added, UTM-tagged for `key`'s
// network (utm_content=reel on videos), on its own labelled line before the
// closing hashtags. On Instagram the links go in as plain text, replacing
// "Link in bio". `site` picks the devya.dev page (default: the day's source).
export function withRequiredLinks(day, key, caption, lang, { site } = {}) {
  if (!caption) return caption;
  const platform = key.split('_')[0];
  const tag = { platform, campaign: campaignSlug(day), content: key.includes('_') ? 'reel' : undefined };
  const links = captionLinks(caption);
  const label = LINK_LABEL[lang === 'ar' ? 'ar' : 'en'];
  const add = [];
  const p = projectLink(day);
  if (p && !links.some((u) => linkBase(u) === linkBase(p))) add.push(`${label.project}: ${tagUrl(p, tag)}`);
  if (!links.some(isSiteLink)) add.push(`${label.site}: ${tagUrl(site || sitePage(day), tag)}`);
  if (!add.length) return caption;
  const lines = (platform === 'instagram' ? caption.replace(LINK_IN_BIO, '') : caption).replace(/\s+$/, '').split('\n').map((l) => l.replace(/\s+$/, ''));
  let end = lines.length;
  while (end > 0 && (isTagLine(lines[end - 1]) || !lines[end - 1].trim())) end--;
  const body = lines.slice(0, end).join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '');
  const tail = lines.slice(end).filter((l) => l.trim()).join('\n');
  return `${body}\n\n${add.join('\n')}${tail ? `\n\n${tail}` : ''}`;
}

// Pages a day may link to: its source page, the contact page, its video
// (day.video, a Devya-channel video), the project's own link, the product it
// shows (card.shot) and any extra page listed in day.links.
export function allowedPages(day) {
  const pages = new Set([linkBase(day.source), `${SITE}/contact`]);
  if (MOVED[linkBase(day.source)]) pages.add(MOVED[linkBase(day.source)]);
  if (day.video) pages.add(linkBase(day.video));
  if (projectLink(day)) pages.add(linkBase(projectLink(day)));
  if (day.card?.shot) pages.add(linkBase(day.card.shot));
  for (const l of day.links || []) pages.add(linkBase(l));
  return pages;
}

export const hashtags = (text = '') => (String(text).match(/(^|\s)(#[\p{L}\p{N}_]+)/gu) || []).map((t) => t.trim());

export const firstLine = (text = '') => String(text).split('\n').find((l) => l.trim()) || '';

const norm = (s) => String(s).toLowerCase().replace(/[ً-ْ]/g, '');

// The first line names at least one of the day's keywords for that language.
// Latin keywords must start a word ("ai" does not match "email"; "index"
// matches "indexes"); Arabic ones may carry a prefix (ال، و، ب) or suffix.
export function keywordLed(text, keywords = []) {
  const line = norm(firstLine(text));
  return keywords.some((k) => {
    if (!k) return false;
    const kw = norm(k);
    if (/[؀-ۿ]/.test(kw)) return line.includes(kw);
    return new RegExp(`(?<![\\p{L}\\p{N}])${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u').test(line);
  });
}

// "Devya" (never DEVYA, devya, ديفيا, Devya Solutions/Software in captions)
// and each product spelled exactly as in PRODUCTS.
export function namingProblems(text) {
  const out = [];
  const body = String(text).replace(/https?:\/\/\S+/g, '').replace(/#[\p{L}\p{N}_]+/gu, '').replace(/@devyasoftware/g, '').replace(/\b[\w-]*\.?devya\.dev\b/g, '');
  if (/ديفيا/.test(body)) out.push('write "Devya" in Latin script, not ديفيا');
  for (const m of body.matchAll(/\bdevya\b/gi)) if (m[0] !== 'Devya') out.push(`"${m[0]}" should be "Devya"`);
  if (/\bDevya (Solutions|Software)\b/.test(body)) out.push('call the company "Devya" (the page names are for the accounts only)');
  for (const p of PRODUCTS) {
    const re = new RegExp(`\\b${p.replace(/[-\s]/g, '[-\\s]?')}\\b`, 'gi');
    // Two-word names in lower case are ordinary prose ("run a contrast check").
    for (const m of body.matchAll(re)) if (m[0] !== p && (/[A-Z]/.test(m[0]) || !/[-\s]/.test(p))) out.push(`"${m[0]}" should be "${p}"`);
  }
  return [...new Set(out)];
}

// Alt text for a feed card image, in the card's language.
export function altText(day, lang) {
  const t = day.card[lang];
  const strip = (s) => String(s || '').replace(/\*/g, '').trim();
  const code = (day.card.code || []).map((b) => strip(typeof b.label === 'object' ? b.label?.[lang] : b.label)).filter(Boolean);
  const commands = (day.card.terminal || []).filter((l) => l.startsWith('$ ')).map((l) => l.slice(2));
  const detail = strip(t.sub) || [...(t.items || t.right?.items || []), ...code, ...commands].map(strip).join(', ');
  const lead = lang === 'ar' ? `بطاقة من Devya بخلفية سوداء ونص فضي: ${strip(t.title)}` : `Devya card, silver text on black: ${strip(t.title)}`;
  let alt = detail ? `${lead} ${detail}` : lead;
  if (alt.length > ALT_MAX) alt = alt.slice(0, ALT_MAX - 1).replace(/\s+\S*$/, '') + '…';
  return alt;
}

export function altProblems(alt) {
  const out = [];
  if (!alt || alt.length < 20) out.push('alt text missing or too short');
  if (alt && alt.length > ALT_MAX) out.push(`alt text over ${ALT_MAX} characters`);
  if (alt && !/Devya/.test(alt)) out.push('alt text should name Devya');
  return out;
}
