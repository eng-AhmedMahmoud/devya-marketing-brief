// YouTube metadata for Devya's channel: titles, descriptions, tags, chapters
// and the link rule, for every episode in social/youtube/episodes.json.
//
// The link rule is the one every Devya post follows (render/seo.mjs): each
// description carries a devya.dev link and, for an episode about a project,
// that project's own link as its devya.dev page lists it (social/projects.json).
// Links are https, never Vercel, and tagged
//   utm_source=youtube&utm_medium=video&utm_campaign=yt-<slug>&utm_content=long|short
// (GA4 files medium "video" from YouTube under Organic Video). Links to other
// videos are Devya-channel videos only: social/videos.json or an episode here
// that has been uploaded.
//
// youtubeProblems(registry) is what render/validate.mjs runs, so the calendar
// gate, CI and the producer all refuse an episode that breaks a rule.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PROJECT_LINKS, DEVYA_VIDEOS, SITE, BRAND_TAG, captionLinks, linkBase, isDevyaHost, isYouTubeHost, youtubeId, videoUrl,
  isProjectLink, namingProblems, hashtags, keywordLed, firstLine,
} from '../render/seo.mjs';
import { isBannedHost } from '../render/shot-guard.mjs';

export const YT_DIR = dirname(fileURLToPath(import.meta.url));
export const REGISTRY_FILE = join(YT_DIR, 'episodes.json');
export const loadRegistry = (file = REGISTRY_FILE) => JSON.parse(readFileSync(file, 'utf8'));

export const PLATFORM = 'youtube';
export const MEDIUM = 'video';
export const TITLE_MAX = 100;
// The part of a title YouTube shows in search and suggested on a phone.
export const TITLE_VISIBLE = 60;
export const DESCRIPTION_MAX = 5000;
export const TAGS_MAX = 500;
export const TAGS_COUNT = [6, 20];
// YouTube shows the first three hashtags above the title; more than 15 and it ignores them all.
export const HASHTAGS = [2, 3];
export const SHORT_MAX_SECONDS = 60;
export const CHAPTER_MIN_SECONDS = 10;
export const KINDS = ['long', 'short'];
export const SLOT = '19:00';
// What YouTube refuses in a title or description.
const FORBIDDEN = /[<>]/;

const LABEL = {
  ar: { project: 'المشروع', site: 'Devya', contact: 'تواصل معانا', full: 'الفيديو الكامل', chapters: 'الفصول' },
  en: { project: 'Project', site: 'Devya', contact: 'Talk to us', full: 'Full video', chapters: 'Chapters' },
};

export const campaign = (ep) => `yt-${ep.parent || ep.slug}`.slice(0, 60);

// The link tagged for this episode (devya.dev and project links only).
export function tagYt(url, ep) {
  const u = new URL(url);
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) u.searchParams.delete(k);
  u.searchParams.set('utm_source', PLATFORM);
  u.searchParams.set('utm_medium', MEDIUM);
  u.searchParams.set('utm_campaign', campaign(ep));
  u.searchParams.set('utm_content', ep.kind);
  return u.toString();
}

// Uploaded episodes, by YouTube id: links between episodes are allowed.
export const episodeIds = (reg) => new Set(reg.episodes.map((e) => e.youtube?.id).filter(Boolean));

export const projectLinkOf = (ep) => (ep.project ? PROJECT_LINKS.get(ep.project) || null : null);

// m:ss or h:mm:ss, as YouTube reads chapter stamps.
export function stamp(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

// Problems with a chapter list [{t, title}] for a video of `duration` seconds.
export function chapterProblems(chapters, duration) {
  const out = [];
  if (!chapters?.length) return ['no chapters'];
  if (chapters.length < 3) out.push(`${chapters.length} chapters; YouTube needs at least 3`);
  if (chapters[0].t !== 0) out.push(`the first chapter starts at ${stamp(chapters[0].t)}, not 0:00`);
  chapters.forEach((c, i) => {
    const next = i + 1 < chapters.length ? chapters[i + 1].t : duration;
    if (!String(c.title || '').trim()) out.push(`chapter ${i + 1} has no title`);
    if (FORBIDDEN.test(c.title || '')) out.push(`chapter "${c.title}" contains < or >`);
    if (next - c.t < CHAPTER_MIN_SECONDS) out.push(`chapter "${c.title}" lasts ${(next - c.t).toFixed(1)} s; YouTube needs ${CHAPTER_MIN_SECONDS} s or more`);
    if (i && c.t <= chapters[i - 1].t) out.push(`chapter "${c.title}" does not start after the one before it`);
  });
  return out;
}

// YouTube's tag budget: characters plus a comma between tags, plus 2 for the
// quotes it adds around a tag with a space.
export const tagsLength = (tags = []) => tags.reduce((n, t) => n + t.length + (/\s/.test(t) ? 2 : 0), 0) + Math.max(0, tags.length - 1);

// The description for an episode. `chapters` [{t, title}] (long-form, from the
// build), `parentId` the uploaded long-form a Short links to.
export function composeDescription(ep, { chapters = null, parentId = null, music = null } = {}) {
  const L = LABEL[ep.lang === 'en' ? 'en' : 'ar'];
  const lines = [...ep.description.lead, ''];
  if (ep.kind === 'short' && parentId) lines.push(`${L.full}: ${videoUrl(parentId)}`);
  const p = projectLinkOf(ep);
  if (p) lines.push(`${ep.description.projectLabel || L.project}: ${tagYt(p, ep)}`);
  lines.push(`${L.site}: ${tagYt(ep.site, ep)}`);
  if (ep.kind === 'long') lines.push(`${L.contact}: ${tagYt(`${SITE}/contact`, ep)}`);
  if (ep.description.body?.length) lines.push('', ...ep.description.body);
  if (ep.description.en) lines.push('', ep.description.en);
  if (chapters?.length) lines.push('', `${L.chapters}:`, ...chapters.map((c) => `${stamp(c.t)} ${c.title}`));
  if (music) lines.push('', `Music: "${music.title}" by ${music.artist} (${music.licence})`);
  lines.push('', ep.hashtags.join(' '));
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Why one description link is unfit, or [].
export function ytLinkProblems(url, ep, ids = new Set()) {
  let u;
  try { u = new URL(url); } catch { return [`not a valid URL: ${url}`]; }
  const out = [];
  if (u.protocol !== 'https:') out.push(`not https: ${url}`);
  if (isBannedHost(u.hostname)) return [...out, `Vercel link ${url} (Vercel is banned)`];
  if (isYouTubeHost(u.hostname)) {
    const id = youtubeId(url);
    if (!DEVYA_VIDEOS.has(id) && !ids.has(id)) out.push(`YouTube link ${url} is not a Devya-channel video (social/videos.json or an uploaded episode)`);
    else if (url !== videoUrl(id)) out.push(`use the canonical ${videoUrl(id)} form: ${url}`);
    return out;
  }
  if (!isDevyaHost(u.hostname) && !isProjectLink(url)) out.push(`link outside devya.dev and the projects it lists (social/projects.json): ${url}`);
  const q = u.searchParams;
  const want = { utm_source: PLATFORM, utm_medium: MEDIUM, utm_campaign: campaign(ep), utm_content: ep.kind };
  for (const [k, v] of Object.entries(want)) if (q.get(k) !== v) out.push(`${k} should be ${v}: ${url}`);
  return out;
}

const isSiteLink = (url) => { try { return ['www.devya.dev', 'devya.dev'].includes(new URL(url).hostname); } catch { return false; } };

// Every problem with one episode's metadata (and its description as composed).
export function episodeProblems(ep, reg, { chapters = null, duration = null, music = null } = {}) {
  const out = [];
  const ids = episodeIds(reg);
  if (!/^[a-z0-9-]+$/.test(ep.slug || '')) out.push('slug must be kebab-case');
  if (!KINDS.includes(ep.kind)) out.push(`kind must be one of ${KINDS.join(', ')}`);
  if (!['ar', 'en'].includes(ep.lang)) out.push('lang must be ar or en');
  if (!reg.playlists?.[ep.playlist]) out.push(`unknown playlist ${ep.playlist}`);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(ep.publishAt || '')) out.push('publishAt must be YYYY-MM-DDTHH:MM (Cairo time)');
  if (ep.project && !PROJECT_LINKS.has(ep.project)) out.push(`project "${ep.project}" has no link in social/projects.json`);
  if (!/^https:\/\/www\.devya\.dev\//.test(ep.site || '')) out.push('site must be a www.devya.dev page');
  if (ep.kind === 'short') {
    const parent = reg.episodes.find((e) => e.slug === ep.parent);
    if (!parent || parent.kind !== 'long') out.push(`parent "${ep.parent}" is not a long-form episode`);
    if (!Array.isArray(ep.beats) || ep.beats.length !== 2) out.push('beats must be [first, last] beat ids of the parent script');
    if (parent && ep.project !== parent.project) out.push('a Short carries its parent\'s project');
  } else if (!ep.script) out.push('a long-form episode needs a script');

  // Title.
  const title = ep.title || '';
  if (!title) out.push('missing title');
  if (title.length > TITLE_MAX) out.push(`title is ${title.length} characters; YouTube allows ${TITLE_MAX}`);
  if (FORBIDDEN.test(title)) out.push('title contains < or >, which YouTube refuses');
  const kw = [...(ep.keywords?.ar || []), ...(ep.keywords?.en || [])];
  if (!ep.keywords?.ar?.length || !ep.keywords?.en?.length) out.push('keywords needs ar and en lists');
  if (!keywordLed(title.slice(0, TITLE_VISIBLE), kw)) out.push(`the first ${TITLE_VISIBLE} characters of the title name none of the keywords`);
  for (const p of namingProblems(title)) out.push(`title: ${p}`);
  if (/vercel\.app|now\.sh/i.test(JSON.stringify(ep))) out.push('a Vercel URL (Vercel is banned)');

  // Tags and hashtags.
  const tags = ep.tags || [];
  if (tags.length < TAGS_COUNT[0] || tags.length > TAGS_COUNT[1]) out.push(`${tags.length} tags; use ${TAGS_COUNT[0]}-${TAGS_COUNT[1]}`);
  if (tagsLength(tags) > TAGS_MAX) out.push(`tags take ${tagsLength(tags)} characters; YouTube allows ${TAGS_MAX}`);
  if (tags.some((t) => FORBIDDEN.test(t) || t.includes(','))) out.push('a tag contains <, > or a comma');
  if (new Set(tags.map((t) => t.toLowerCase())).size !== tags.length) out.push('duplicate tags');
  const tagsH = ep.hashtags || [];
  if (tagsH.length < HASHTAGS[0] || tagsH.length > HASHTAGS[1]) out.push(`${tagsH.length} hashtags; use ${HASHTAGS[0]}-${HASHTAGS[1]}`);
  if (!tagsH.includes(BRAND_TAG)) out.push(`hashtags must include ${BRAND_TAG}`);
  if (tagsH.some((h) => !/^#[\p{L}\p{N}_]+$/u.test(h))) out.push('a hashtag is not #word');

  // Description, as composed.
  if (!ep.description?.lead?.length) { out.push('description.lead needs the hook lines'); return out; }
  const parentId = ep.kind === 'short' ? reg.episodes.find((e) => e.slug === ep.parent)?.youtube?.id || null : null;
  const desc = composeDescription(ep, { chapters, parentId, music });
  if (desc.length > DESCRIPTION_MAX) out.push(`description is ${desc.length} characters; YouTube allows ${DESCRIPTION_MAX}`);
  if (FORBIDDEN.test(desc)) out.push('description contains < or >, which YouTube refuses');
  if (!keywordLed(firstLine(desc), kw)) out.push('the description\'s first line names none of the keywords');
  for (const p of namingProblems(desc)) out.push(`description: ${p}`);
  const links = captionLinks(desc);
  for (const l of links) out.push(...ytLinkProblems(l, ep, ids));
  if (!links.some(isSiteLink)) out.push('description is missing a devya.dev link');
  const p = projectLinkOf(ep);
  if (p && !links.some((l) => linkBase(l) === linkBase(p))) out.push(`description is missing the project's link ${p}`);
  if (hashtags(desc).length > 15) out.push('more than 15 hashtags: YouTube ignores them all');
  if (chapters) out.push(...chapterProblems(chapters, duration ?? Infinity).map((m) => `chapters: ${m}`));
  if (ep.kind === 'short' && duration != null && duration > SHORT_MAX_SECONDS) out.push(`a Short runs ${duration.toFixed(1)} s; keep it under ${SHORT_MAX_SECONDS} s`);
  if (ep.kind === 'short' && parentId && !links.some((l) => youtubeId(l) === parentId)) out.push('a Short links its full video');
  return out;
}

// Every problem in the registry: per episode, plus the daily schedule (one
// upload a day at the slot; no two on one day).
export function youtubeProblems(reg, { built = {} } = {}) {
  const out = [];
  const seen = new Map();
  const slugs = new Set();
  for (const ep of reg.episodes || []) {
    const where = ep.publishAt ? ep.publishAt.slice(0, 10) : ep.slug;
    if (slugs.has(ep.slug)) out.push({ where, slug: ep.slug, msg: 'duplicate slug' });
    slugs.add(ep.slug);
    for (const msg of episodeProblems(ep, reg, built[ep.slug] || {})) out.push({ where, slug: ep.slug, msg });
    const day = (ep.publishAt || '').slice(0, 10);
    if (day && seen.has(day)) out.push({ where, slug: ep.slug, msg: `two uploads on ${day} (${seen.get(day)} too): one a day` });
    seen.set(day, ep.slug);
    if (ep.publishAt && ep.publishAt.slice(11) !== (reg.slot || SLOT)) out.push({ where, slug: ep.slug, msg: `publishAt should be at the ${reg.slot || SLOT} slot` });
  }
  return out;
}

// Days between the first and last upload with nothing scheduled.
export function scheduleGaps(reg) {
  const days = [...new Set(reg.episodes.map((e) => (e.publishAt || '').slice(0, 10)).filter(Boolean))].sort();
  const gaps = [];
  for (let i = 1; i < days.length; i++) {
    for (let t = Date.parse(`${days[i - 1]}T12:00:00Z`) + 86400000; t < Date.parse(`${days[i]}T12:00:00Z`); t += 86400000) gaps.push(new Date(t).toISOString().slice(0, 10));
  }
  return gaps;
}

// Every link base a registry's descriptions use (for validate.mjs --live).
export function registryLinks(reg) {
  const out = new Map();
  for (const ep of reg.episodes) {
    const desc = composeDescription(ep, {});
    for (const l of captionLinks(desc)) if (!isYouTubeHost(new URL(l).hostname)) out.set(linkBase(l), (ep.publishAt || '').slice(0, 10) || ep.slug);
  }
  return out;
}
