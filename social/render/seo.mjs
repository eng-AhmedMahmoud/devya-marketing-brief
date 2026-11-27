// Links and SEO rules for every caption the routine publishes.
//
// Links: https only, on www.devya.dev or a Devya product host (*.devya.dev),
// never Vercel, and tagged utm_source=<platform>&utm_medium=social&
// utm_campaign=<post slug> (+ utm_content=reel on video captions).
// Captions: keyword-led first line, platform-appropriate hashtags including
// #BuildWithDevya, "Devya" and product names spelled one way, alt text on images.
//
// validate.mjs applies these to every day from RULES_FROM on; days before it
// were published under the older rules and are left as the record.

import { isBannedHost } from './shot-guard.mjs';

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
export const PRODUCTS = ['Devya Converse', 'X-Ray', 'CopyForge', 'ShotCraft', 'PlaceHarvest', 'AdGap', 'Urania', 'og-preview', 'jwt-inspector', 'cron-builder', 'contrast-check'];

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

// URLs in a caption, without trailing punctuation.
export const captionLinks = (text = '') => (String(text).match(/https?:\/\/[^\s)>\]]+/g) || []).map((u) => u.replace(/[.,;:!?'"]+$/, ''));

export const isDevyaHost = (host) => host === 'www.devya.dev' || host === 'devya.dev' || /^[a-z0-9-]+\.devya\.dev$/.test(host);

// The link without its query string, for "is this the right page".
export const linkBase = (url) => { const u = new URL(url); return `${u.origin}${u.pathname.replace(/\/$/, '') || ''}`; };

// Why a caption link is unfit, or [] when it is fine.
export function linkProblems(url, { platform, campaign, content } = {}) {
  let u;
  try { u = new URL(url); } catch { return [`not a valid URL: ${url}`]; }
  const out = [];
  if (u.protocol !== 'https:') out.push(`not https: ${url}`);
  if (isBannedHost(u.hostname)) out.push(`Vercel link ${url} (Vercel is banned)`);
  else if (!isDevyaHost(u.hostname)) out.push(`link outside devya.dev: ${url}`);
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

// The day with every devya.dev link in its feed captions tagged for its
// network and the day's campaign (used by merge-days.mjs, so drafts can carry
// plain links). Off-site and Vercel links are left as they are for the
// validator to reject.
export function tagDayLinks(day) {
  const campaign = campaignSlug(day);
  const posts = {};
  for (const [net, p] of Object.entries(day.posts || {})) {
    let caption = p.caption || '';
    for (const url of captionLinks(caption)) {
      let host;
      try { host = new URL(url).hostname; } catch { continue; }
      if (isDevyaHost(host) && !isBannedHost(host)) caption = caption.replace(url, tagUrl(url, { platform: net, campaign }));
    }
    posts[net] = { ...p, caption };
  }
  return { ...day, posts };
}

// Pages a day may link to: its source page, the contact page, the product it
// shows (card.shot) and any extra page listed in day.links.
export function allowedPages(day) {
  const pages = new Set([linkBase(day.source), `${SITE}/contact`]);
  if (day.card?.shot) pages.add(linkBase(day.card.shot));
  for (const l of day.links || []) pages.add(linkBase(l));
  return pages;
}

export const hashtags = (text = '') => (String(text).match(/(^|\s)(#[\p{L}\p{N}_]+)/gu) || []).map((t) => t.trim());

export const firstLine = (text = '') => String(text).split('\n').find((l) => l.trim()) || '';

const norm = (s) => String(s).toLowerCase().replace(/[ً-ْ]/g, '');

// The first line names at least one of the day's keywords for that language.
export function keywordLed(text, keywords = []) {
  const line = norm(firstLine(text));
  return keywords.some((k) => k && line.includes(norm(k)));
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
