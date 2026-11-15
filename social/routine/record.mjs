#!/usr/bin/env node
// Records a publish run: reads the worker's RESULT_JSON payload on stdin,
// copies each proof screenshot into social/proof/, updates social/state.json
// and appends rows to social/log.md. Deterministic; the model never writes files.
//
//   echo '<payload>' | node record.mjs [--by routine|manual]
//
// Payload: {"date":"2026-11-16","results":{"linkedin":{"status":"published",
//           "url":"https://...","proof":"/abs/path.jpg","note":""}, ...}}
// status: published | blocked | failed | skipped

import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOCIAL = join(dirname(fileURLToPath(import.meta.url)), '..');
const statePath = join(SOCIAL, 'state.json');
const logPath = join(SOCIAL, 'log.md');
const cal = JSON.parse(readFileSync(join(SOCIAL, 'calendar.json'), 'utf8'));
const by = process.argv.includes('--by') ? process.argv[process.argv.indexOf('--by') + 1] : 'routine';

const payload = JSON.parse(readFileSync(0, 'utf8'));
const { date, results } = payload;
if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !results) { console.error('record: bad payload'); process.exit(1); }
const day = cal.days.find((d) => d.date === date);
const NET = { linkedin: 'LinkedIn', facebook: 'Facebook', instagram: 'Instagram' };
const ALLOWED_HOST = { linkedin: /^https:\/\/(www\.)?linkedin\.com\//, facebook: /^https:\/\/(www\.)?facebook\.com\//, instagram: /^https:\/\/(www\.)?instagram\.com\// };

const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { version: 1, published: {} };
state.published[date] ||= {};
const stamp = new Intl.DateTimeFormat('sv-SE', { timeZone: cal.timezone, dateStyle: 'short', timeStyle: 'short' }).format(new Date());

if (!existsSync(logPath)) {
  writeFileSync(logPath, '# Devya social publish log\n\nOne row per network per run. Written by `routine/record.mjs`; the routine\'s full transcript is in `~/Library/Logs/devya-social-daily.log`.\n\n| Date | Day | Network | Lang | Status | Recorded (Cairo) | Post | Proof | Note |\n|---|---|---|---|---|---|---|---|---|\n');
}

let problems = 0;
for (const [net, r] of Object.entries(results)) {
  if (!NET[net]) continue;
  let { status, url, proof, note } = r;
  if (status === 'published' && url && url !== 'posted' && !ALLOWED_HOST[net].test(url)) { note = `rejected url ${url}`; url = null; status = 'failed'; }
  let proofRel = '';
  if (proof && existsSync(proof)) {
    mkdirSync(join(SOCIAL, 'proof'), { recursive: true });
    proofRel = `proof/${date}-${net}${extname(proof) || '.jpg'}`;
    copyFileSync(proof, join(SOCIAL, proofRel));
  }
  if (status === 'published') {
    state.published[date][net] = { url: url || 'posted', at: stamp, by, ...(proofRel ? { proof: proofRel } : {}) };
  } else {
    problems++;
  }
  const lang = day?.posts?.[net]?.lang?.toUpperCase() ?? '';
  const link = url && url !== 'posted' ? `[open](${url})` : (url || '');
  const clean = (s) => String(s || '').replace(/\|/g, '/').replace(/\n/g, ' ').slice(0, 200);
  appendFileSync(logPath, `| ${date} | ${day?.day ?? ''} | ${NET[net]} | ${lang} | ${status} | ${stamp} | ${link} | ${proofRel ? `[shot](${proofRel})` : ''} | ${clean(note)} |\n`);
}
writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
console.log(`recorded ${Object.keys(results).length} result(s) for ${date}${problems ? `, ${problems} not published` : ''}`);
process.exit(problems ? 3 : 0);
