#!/usr/bin/env node
// Audits every Devya social post against the brand/SEO standard (a CC0 music
// bed on video, UTM-tagged links that pass seo.linkProblems, platform hashtag
// counts with #BuildWithDevya, the official logo and black/silver theme) and
// says how each one that falls short is fixed:
//
//   published posts (state.json): the corrected caption, checked by the same
//     rules as validate.mjs, to edit in place; the replacement media; and, where
//     a platform cannot replace media in place, a "repost needed" entry (never
//     acted on here: deleting a live post is the developer's call);
//   scheduled posts (calendar days from today on): validate.mjs --date, the
//     committed cards' theme, and the video recipe (music is mixed in when the
//     routine renders it).
//
//   node audit.mjs [--today YYYY-MM-DD] [--render] [--out social/audit]
//     --render  also renders replacement cards to <out>/media/<date>/<net>.png
//               and replacement videos (visuals/<date>/reel-<lang>.mp4, with music)
// Writes <out>/<today>.json (manifest) and <out>/<today>.md (report).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { RULES_FROM, POST_TAGS, REEL_TAGS, BRAND_TAG, campaignSlug, captionLinks, linkProblems, mapLinks, tagUrl, hashtags, isDevyaHost } from './seo.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOCIAL = join(HERE, '..');
const REPO = join(SOCIAL, '..');

const NET = { linkedin: 'LinkedIn post', facebook: 'Facebook post', instagram: 'Instagram post', linkedin_video: 'LinkedIn video', facebook_reel: 'Facebook Reel', instagram_reel: 'Instagram Reel', facebook_story: 'Facebook Story', instagram_story: 'Instagram Story' };
// www.devya.dev pages that now redirect, and where they went.
export const MOVED = { 'https://www.devya.dev/services': 'https://www.devya.dev/solutions' };

const isTagLine = (l) => /^\s*(#[\p{L}\p{N}_]+\s*)+$/u.test(l);

// Rebuilds a caption's closing hashtag line: #BuildWithDevya first, then the
// caption's own tags (or `extra` when it has none), within [lo, hi].
export function fixHashtags(caption, [lo, hi], extra = []) {
  const lines = caption.replace(/\s+$/, '').split('\n');
  let end = lines.length;
  while (end > 0 && (isTagLine(lines[end - 1]) || !lines[end - 1].trim())) end--;
  const block = lines.slice(end).join(' ');
  const own = hashtags(block);
  const inline = hashtags(lines.slice(0, end).join('\n')).length;
  const tags = [...new Set([BRAND_TAG, ...own, ...(own.length ? [] : extra)])].filter((t) => t);
  const keep = tags.slice(0, Math.max(0, hi - inline));
  if (inline + keep.length < lo) return caption; // cannot reach the minimum without inventing tags
  return `${lines.slice(0, end).join('\n').replace(/\s+$/, '')}\n\n${keep.join(' ')}`;
}

// The caption a published post should carry under the current rules.
export function fixCaption(day, key, caption) {
  if (!caption) return caption;
  const platform = key.split('_')[0];
  const video = key.includes('_');
  const campaign = campaignSlug(day);
  let out = mapLinks(caption, (url) => {
    let host;
    try { host = new URL(url).hostname; } catch { return url; }
    if (!isDevyaHost(host)) return url;
    let base = url.split('?')[0].replace(/\/$/, '');
    base = MOVED[base] || base;
    return tagUrl(base, { platform, campaign, content: video ? 'reel' : undefined });
  });
  const range = (video ? REEL_TAGS : POST_TAGS)[platform];
  const linkedinTags = hashtags(day.posts?.linkedin?.caption || '').filter((t) => t !== BRAND_TAG);
  const n = hashtags(out).length;
  if (n < range[0] || n > range[1] || (!video && !hashtags(out).includes(BRAND_TAG))) out = fixHashtags(out, range, linkedinTags.slice(0, range[1] - 1));
  return out;
}

// Problems a caption has under the current link and hashtag rules.
export function captionProblems(day, key, caption) {
  if (!caption) return [];
  const platform = key.split('_')[0];
  const video = key.includes('_');
  const out = [];
  for (const url of captionLinks(caption)) {
    out.push(...linkProblems(url, { platform, campaign: campaignSlug(day), content: video ? 'reel' : undefined }));
    const base = url.split('?')[0].replace(/\/$/, '');
    if (MOVED[base]) out.push(`${base} redirects to ${MOVED[base]}`);
  }
  const [lo, hi] = (video ? REEL_TAGS : POST_TAGS)[platform];
  const n = hashtags(caption).length;
  if (n < lo || n > hi) out.push(`${n} hashtags, want ${lo}-${hi}`);
  if (!video && !hashtags(caption).includes(BRAND_TAG)) out.push(`no ${BRAND_TAG}`);
  return out;
}

const captionOf = (day, key) => {
  if (day.posts?.[key]) return day.posts[key].caption;
  const [platform, kind] = key.split('_');
  if (kind === 'story') return null;
  return day.reels?.[platform]?.caption ?? null;
};
const langOf = (day, key) => day.posts?.[key]?.lang || day.reels?.[key.split('_')[0]]?.lang || day.stories?.[key.split('_')[0]]?.lang;

// What a platform can change on a live post without deleting it.
const CAN = {
  linkedin: { caption: true, media: false },
  facebook: { caption: true, media: false },
  instagram: { caption: true, media: false },
  linkedin_video: { caption: true, media: false },
  facebook_reel: { caption: true, media: true },
  instagram_reel: { caption: true, media: false },
  facebook_story: { caption: false, media: false },
  instagram_story: { caption: false, media: false },
};

export function auditPublished(cal, state, { today }) {
  const rows = [];
  for (const [date, nets] of Object.entries(state.published || {})) {
    const day = cal.days.find((d) => d.date === date);
    if (!day || date >= today) continue;
    for (const [key, rec] of Object.entries(nets)) {
      const caption = captionOf(day, key);
      const lang = langOf(day, key);
      const oldTemplate = date < RULES_FROM;
      const media = key in { linkedin: 1, facebook: 1, instagram: 1 } ? 'image' : 'video';
      const issues = [];
      if (oldTemplate && media === 'image') issues.push('card made with the old template: "</>DEVYA" text mark instead of the official wordmark, per-pillar colour accent instead of black and silver');
      if (oldTemplate && media === 'video') issues.push('video rendered before the music bed: silent track; old template (text mark, colour accent)');
      const capIssues = captionProblems(day, key, caption);
      issues.push(...capIssues.map((p) => `caption: ${p}`));
      const actions = [];
      if (capIssues.length) {
        const fixed = fixCaption(day, key, caption);
        actions.push({ type: 'edit-caption', inPlace: CAN[key].caption, caption: fixed, remaining: captionProblems(day, key, fixed) });
      }
      if (oldTemplate) {
        const file = media === 'image' ? `social/audit/media/${date}/${key}.png` : `social/visuals/${date}/reel-${lang}.mp4`;
        if (key.endsWith('_story')) actions.push({ type: 'none', inPlace: false, reason: 'Stories disappear after 24 hours and cannot be edited; it has expired or will expire on its own' });
        else if (CAN[key].media) actions.push({ type: 'replace-video', inPlace: true, media: file, note: 'Facebook replaces a Reel\'s video in place; the Reel gets a new ID, so record the new URL in state.json' });
        else actions.push({ type: 'repost-needed', inPlace: false, media: file, reason: `${NET[key].split(' ')[0]} cannot replace the ${media} of a published post`, recommendation: 'keep it: do not delete; future posts carry the new standard, and the caption fix (if any) is applied in place' });
      }
      rows.push({ date, network: key, label: NET[key], lang, url: rec.url, published: rec.at, issues, actions });
    }
  }
  return rows;
}

export function auditScheduled(cal, { today, themeOf }) {
  const rows = [];
  for (const day of cal.days.filter((d) => d.date >= today && !d.skip)) {
    const v = spawnSync(process.execPath, [join(HERE, 'validate.mjs'), '--date', day.date], { encoding: 'utf8' });
    const issues = v.status === 0 ? [] : (v.stderr || '').split('\n').filter((l) => l.startsWith('✗')).map((l) => l.replace(/^✗ \S+ /, ''));
    for (const net of ['linkedin', 'facebook', 'instagram']) {
      const f = join(SOCIAL, 'visuals', day.date, `${net}.png`);
      if (!existsSync(f)) issues.push(`${net}.png missing`);
      else issues.push(...themeOf(f).map((p) => `${net}.png: ${p}`));
    }
    rows.push({ date: day.date, topic: day.topic, video: day.video || null, issues, music: 'mixed in when the routine renders the video (CC0 bed, -14 LUFS, recipe stamp)' });
  }
  return rows;
}

function markdown({ today, published, scheduled }) {
  const out = [`# Social post audit, ${today}`, '', 'Standard: CC0 music bed on every video; links on devya.dev (or a Devya-channel YouTube video) tagged `utm_source/utm_medium=social/utm_campaign`; hashtags LinkedIn 3–5, Facebook 1–3, Instagram 3–5 with #BuildWithDevya; the official wordmark and black and silver theme. Generated by `node social/render/audit.mjs`.', ''];
  const edits = published.flatMap((r) => r.actions.filter((a) => a.type === 'edit-caption').map((a) => ({ r, a })));
  const swaps = published.flatMap((r) => r.actions.filter((a) => a.type === 'replace-video').map((a) => ({ r, a })));
  const reposts = published.flatMap((r) => r.actions.filter((a) => a.type === 'repost-needed').map((a) => ({ r, a })));
  out.push(`## Published posts: ${published.length}`, '', `- Caption edits in place: ${edits.length}`, `- Facebook Reel videos to replace in place: ${swaps.length} (Facebook reissues the Reel under a new ID, so its URL changes and its view count restarts)`, `- Need delete and repost to fix the media (not done; recommendation below): ${reposts.length}`, `- Stories (expire, cannot be edited): ${published.filter((r) => r.network.endsWith('_story')).length}`, '');
  out.push('| Date | Post | Lang | Issues | Fix |', '|---|---|---|---|---|');
  for (const r of published) {
    const fix = r.actions.map((a) => ({ 'edit-caption': 'edit caption in place', 'replace-video': 'replace video in place', 'repost-needed': 'media: repost needed (keep, see below)', none: 'none (story)' }[a.type])).join('; ') || 'none';
    out.push(`| ${r.date} | [${r.label}](${r.url === 'posted' ? '#' : r.url}) | ${String(r.lang || '').toUpperCase()} | ${r.issues.join('<br>') || 'passes'} | ${fix} |`);
  }
  out.push('', '## Caption edits (exact new text)', '');
  for (const { r, a } of edits) out.push(`### ${r.date} ${r.label}`, '', r.url, '', '```text', a.caption, '```', '');
  out.push('## Posts that can only be fixed by deleting and reposting', '', 'Not deleted. Recommendation for each: keep it. Reposting days-old content duplicates it in followers\' feeds and drops its reactions and comments; the caption fixes above carry the link and hashtag value, and every post from 2026-11-28 on has the music bed, logo and theme. Replacement media is ready if you decide otherwise.', '');
  for (const { r, a } of reposts) out.push(`- ${r.date} ${r.label} (${r.url}): ${a.reason}. Replacement: \`${a.media}\`${a.media.endsWith('.mp4') ? ` (made by \`node social/render/render-reel.mjs --date ${r.date}\`)` : ''}`);
  out.push('', 'In-place edits need the Devya accounts, which are signed in only in the ceo seat\'s Chrome (Profile 2). From the routine\'s clone on that seat: `social/routine/fix-published.sh` (add `--dry-run` to list the items first). It edits captions and swaps Facebook Reel videos, never deletes or reposts, and records new URLs in state.json.');
  out.push('', `## Scheduled posts: ${scheduled.length}`, '', '| Date | Topic | Result |', '|---|---|---|');
  for (const s of scheduled) out.push(`| ${s.date} | ${s.topic}${s.video ? ` ([video](${s.video}))` : ''} | ${s.issues.length ? s.issues.join('<br>') : 'passes (cards on theme, links tagged, video gets the music bed)'} |`);
  return out.join('\n') + '\n';
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
  const today = opt('--today', new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date()));
  const outDir = resolve(REPO, opt('--out', 'social/audit'));
  const cal = JSON.parse(readFileSync(join(SOCIAL, 'calendar.json'), 'utf8'));
  const state = JSON.parse(readFileSync(join(SOCIAL, 'state.json'), 'utf8'));
  const { chromium } = await import('playwright-core');
  const { themePixelProblems } = await import('./brand-check.mjs');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const cache = new Map();
  for (const day of cal.days.filter((d) => d.date >= today)) for (const net of ['linkedin', 'facebook', 'instagram']) {
    const f = join(SOCIAL, 'visuals', day.date, `${net}.png`);
    if (existsSync(f)) cache.set(f, await themePixelProblems(page, readFileSync(f)));
  }
  const published = auditPublished(cal, state, { today });
  const scheduled = auditScheduled(cal, { today, themeOf: (f) => cache.get(f) || [] });
  if (args.includes('--render')) {
    const { renderCard } = await import('./render.mjs');
    for (const r of published) for (const a of r.actions) {
      if (!a.media) continue;
      const day = cal.days.find((d) => d.date === r.date);
      if (a.media.endsWith('.png')) {
        if (day.layout === 'product' && !day._shot) {
          const shot = join(SOCIAL, 'visuals', day.date, 'shot.png');
          if (!existsSync(shot)) { const { shoot } = await import('./render.mjs'); await shoot(browser, day.card.shot, shot); }
          day._shot = readFileSync(shot).toString('base64');
        }
        const { png, problems } = await renderCard(browser, day, r.network === 'linkedin' ? 'landscape' : 'portrait', r.lang);
        if (problems.length) throw new Error(`replacement card ${r.date} ${r.network}: ${problems.join('; ')}`);
        mkdirSync(join(REPO, dirname(a.media)), { recursive: true });
        writeFileSync(join(REPO, a.media), png);
        console.log(`replacement card ${a.media}`);
      }
    }
    const dates = [...new Set(published.filter((r) => r.actions.some((a) => a.media?.endsWith('.mp4'))).map((r) => r.date))];
    for (const d of dates) {
      const rr = spawnSync(process.execPath, [join(HERE, 'render-reel.mjs'), '--date', d], { stdio: 'inherit' });
      if (rr.status !== 0 && rr.status !== 3) throw new Error(`replacement video for ${d} failed (rc ${rr.status})`);
    }
  }
  await browser.close();
  mkdirSync(outDir, { recursive: true });
  const manifest = { today, standard: 'social/README.md#brand-music-and-links', published, scheduled };
  writeFileSync(join(outDir, `${today}.json`), JSON.stringify(manifest, null, 2) + '\n');
  writeFileSync(join(outDir, `${today}.md`), markdown(manifest));
  const bad = published.flatMap((r) => r.actions.filter((a) => a.remaining?.length).map((a) => `${r.date} ${r.network}: ${a.remaining.join('; ')}`));
  console.log(`audit ${today}: ${published.length} published posts (${published.filter((r) => r.issues.length).length} fall short), ${scheduled.length} scheduled days (${scheduled.filter((s) => s.issues.length).length} fall short) → ${relative(REPO, join(outDir, `${today}.md`))}`);
  if (bad.length) { console.error(`corrected captions still fail:\n${bad.join('\n')}`); process.exit(1); }
  if (scheduled.some((s) => s.issues.length)) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e); process.exit(1); });
