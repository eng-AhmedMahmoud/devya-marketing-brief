#!/usr/bin/env node
// Lists the in-place fixes from the newest audit (social/audit/<date>.json,
// written by render/audit.mjs) for the fix-published worker: caption edits and
// Facebook Reel video swaps on posts that are already live. Never lists a
// delete or a repost: those are the developer's decision.
//
//   node fix-published.mjs [--audit social/audit/2026-11-28.json] [--only facebook_reel,linkedin]
//
// Output: {audit, items:[{date, network, url, lang, caption?, media?}]}

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOCIAL = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = join(SOCIAL, '..');
const args = process.argv.slice(2);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);

const dir = join(SOCIAL, 'audit');
const file = opt('--audit') ? join(REPO, opt('--audit')) : join(dir, readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().at(-1));
const audit = JSON.parse(readFileSync(file, 'utf8'));
const only = opt('--only') ? opt('--only').split(',') : null;

const items = [];
for (const r of audit.published) {
  if (only && !only.includes(r.network)) continue;
  const caption = r.actions.find((a) => a.type === 'edit-caption' && a.inPlace)?.caption;
  const swap = r.actions.find((a) => a.type === 'replace-video' && a.inPlace);
  if (!caption && !swap) continue;
  const media = swap ? join(REPO, swap.media) : undefined;
  if (media && !existsSync(media)) throw new Error(`${r.date} ${r.network}: replacement video ${media} is missing; run node social/render/render-reel.mjs --date ${r.date}`);
  items.push({ date: r.date, network: r.network, url: r.url, lang: r.lang, ...(caption ? { caption } : {}), ...(media ? { media } : {}) });
}
console.log(JSON.stringify({ audit: file.replace(`${REPO}/`, ''), items }, null, 2));
