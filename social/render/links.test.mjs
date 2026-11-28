// The two-link rule (2026-11-28): every caption, on every network and kind
// (Instagram as plain text), carries a devya.dev link, and a caption about a
// project also carries the project's own link as listed on its devya.dev page
// (social/projects.json). validate.mjs blocks publishing when either is missing.
//   node --test social/render/links.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  RULES_FROM, PROJECT_LINKS, campaignSlug, captionLinks, linkBase, linkProblems, hashtags,
  projectSlug, projectLink, requiredLinkProblems, withRequiredLinks,
} from './seo.mjs';
import { isBannedHost } from './shot-guard.mjs';
import { composeReels } from './compose.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CAL = JSON.parse(readFileSync(join(HERE, '..', 'calendar.json'), 'utf8'));
const modern = CAL.days.filter((d) => d.date >= RULES_FROM);
const projectDay = () => structuredClone(modern.find((d) => projectSlug(d) && PROJECT_LINKS.has(projectSlug(d))));
const plainDay = () => structuredClone(modern.find((d) => !projectSlug(d)));
const KEYS = { linkedin: 'linkedin_video', facebook: 'facebook_reel', instagram: 'instagram_reel' };

const runValidate = (cal, extra = []) => {
  const dir = mkdtempSync(join(tmpdir(), 'devya-links-'));
  try {
    const f = join(dir, 'calendar.json');
    writeFileSync(f, JSON.stringify(cal));
    return spawnSync(process.execPath, [join(HERE, 'validate.mjs'), '--calendar', f, ...extra], { encoding: 'utf8' });
  } finally { rmSync(dir, { recursive: true, force: true }); }
};

test('projects.json: https links, never Vercel, and one for every project day in the calendar', () => {
  for (const [slug, url] of PROJECT_LINKS) {
    const u = new URL(url);
    assert.equal(u.protocol, 'https:', slug);
    assert.ok(!isBannedHost(u.hostname), `${slug}: Vercel`);
    assert.equal(u.search, '', `${slug}: store the plain link; the pipeline adds the UTM tags`);
  }
  for (const d of CAL.days.filter((x) => projectSlug(x))) assert.ok(projectLink(d), `${d.date} ${projectSlug(d)} has no project link`);
});

test('every scheduled caption, posts and videos on every network, carries both links', () => {
  for (const d of modern) {
    for (const [net, p] of Object.entries(d.posts)) assert.deepEqual(requiredLinkProblems(d, p.caption), [], `${d.date} ${net}`);
    for (const [net, r] of Object.entries(d.reels)) assert.deepEqual(requiredLinkProblems(d, r.caption), [], `${d.date} reels.${net}`);
  }
});

test('requiredLinkProblems: a project day needs the project link and a devya.dev link', () => {
  const d = projectDay();
  const project = projectLink(d);
  const site = `https://www.devya.dev/projects/${projectSlug(d)}`;
  assert.match(requiredLinkProblems(d, 'Nothing here.').join('\n'), /missing the project's link[\s\S]*missing a devya\.dev link/);
  assert.match(requiredLinkProblems(d, `Only the site: ${site}`).join(), /missing the project's link/);
  assert.match(requiredLinkProblems(d, `Only the project: ${project}`).join(), /missing a devya\.dev link/);
  assert.deepEqual(requiredLinkProblems(d, `${project}\n${site}`), []);
  // A *.devya.dev product host is not the devya.dev site.
  assert.match(requiredLinkProblems(d, `${project}\nhttps://urania.devya.dev`).join(), /missing a devya\.dev link/);
});

test('requiredLinkProblems: a day not about a project needs only a devya.dev link', () => {
  const d = plainDay();
  assert.match(requiredLinkProblems(d, 'No links.').join(), /missing a devya\.dev link/);
  assert.deepEqual(requiredLinkProblems(d, 'See https://www.devya.dev/contact'), []);
});

test('requiredLinkProblems: a project missing from projects.json is reported, not passed', () => {
  const d = { ...plainDay(), source: 'https://www.devya.dev/projects/not-registered', video: undefined };
  assert.match(requiredLinkProblems(d, 'https://www.devya.dev/projects/not-registered').join(), /no link in social\/projects\.json/);
});

test('withRequiredLinks adds the missing links, tagged, before the hashtags, and is idempotent', () => {
  const d = projectDay();
  for (const key of ['linkedin', 'facebook', 'instagram', 'linkedin_video', 'facebook_reel', 'instagram_reel']) {
    const platform = key.split('_')[0];
    const input = 'First line about the thing.\nSecond line.\n\n#BuildWithDevya #One #Two';
    const out = withRequiredLinks(d, key, input, 'en');
    assert.deepEqual(requiredLinkProblems(d, out), [], key);
    for (const u of captionLinks(out)) assert.deepEqual(linkProblems(u, { platform, campaign: campaignSlug(d), content: key.includes('_') ? 'reel' : undefined }), [], `${key} ${u}`);
    assert.ok(out.startsWith('First line about the thing.\nSecond line.\n\n'), key);
    assert.ok(out.endsWith('\n\n#BuildWithDevya #One #Two'), `${key}: hashtags stay last`);
    assert.deepEqual(hashtags(out), hashtags(input));
    assert.equal(withRequiredLinks(d, key, out, 'en'), out, `${key}: idempotent`);
  }
});

test('withRequiredLinks: Instagram gets plain-text links instead of "Link in bio"; Arabic gets Arabic labels', () => {
  const d = projectDay();
  const en = withRequiredLinks(d, 'instagram', 'A line. Link in bio.\n\n#BuildWithDevya #A #B', 'en');
  assert.doesNotMatch(en, /link in bio/i);
  assert.match(en, /^A line\.\n\nProject: https:\/\/\S+\nDetails: https:\/\/www\.devya\.dev\/\S+\n\n#BuildWithDevya #A #B$/);
  const ar = withRequiredLinks(d, 'instagram', 'سطر واحد. الرابط في البايو.\n\n#BuildWithDevya #أ #ب', 'ar');
  assert.doesNotMatch(ar, /البايو/);
  assert.match(ar, /\nرابط المشروع: https:\/\/\S+\nالتفاصيل: https:\/\/www\.devya\.dev\//);
});

test('withRequiredLinks keeps links already there and adds only the one missing', () => {
  const d = projectDay();
  const site = `https://www.devya.dev/projects/${projectSlug(d)}?utm_source=facebook&utm_medium=social&utm_campaign=${campaignSlug(d)}`;
  const out = withRequiredLinks(d, 'facebook', `Body.\nMore: ${site}\n\n#BuildWithDevya`, 'en');
  assert.equal(captionLinks(out).length, 2);
  assert.equal(captionLinks(out)[0], site);
  assert.equal(linkBase(captionLinks(out)[1]), linkBase(projectLink(d)));
});

test('linkProblems accepts a project link listed on devya.dev and rejects other off-site links', () => {
  const d = projectDay();
  const tag = `utm_source=linkedin&utm_medium=social&utm_campaign=${campaignSlug(d)}`;
  const listed = new URL(projectLink(d));
  listed.search = tag;
  assert.deepEqual(linkProblems(listed.toString(), { platform: 'linkedin', campaign: campaignSlug(d) }), []);
  assert.match(linkProblems(`https://github.com/someone-else/repo?${tag}`, { platform: 'linkedin', campaign: campaignSlug(d) }).join(), /outside devya\.dev/);
});

test('composeReels gives every reel both links on a project day', () => {
  const d = projectDay();
  const { reels } = composeReels(d);
  for (const net of Object.keys(KEYS)) assert.deepEqual(requiredLinkProblems(d, reels[net].caption), [], net);
});

// The routine's pre-publish gate is `validate.mjs --date <today>`: exit 1 holds the day.
test('validate.mjs --date blocks a day whose Instagram post lacks the project link', () => {
  const cal = structuredClone(CAL);
  const d = cal.days.find((x) => x.date === projectDay().date);
  const p = linkBase(projectLink(d));
  d.posts.instagram.caption = d.posts.instagram.caption.split('\n').filter((l) => !captionLinks(l).some((u) => linkBase(u) === p)).join('\n');
  const r = runValidate(cal, ['--date', d.date]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /instagram: missing the project's link/);
});

test('validate.mjs --date blocks a day whose LinkedIn video caption lacks the devya.dev link', () => {
  const cal = structuredClone(CAL);
  const d = cal.days.find((x) => x.date === plainDay().date);
  d.reels.linkedin.caption = d.reels.linkedin.caption.split('\n').filter((l) => !/www\.devya\.dev/.test(l)).join('\n');
  const r = runValidate(cal, ['--date', d.date]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /reels\.linkedin: missing a devya\.dev link/);
});

test('validate.mjs passes a day once both links are back (the gate is the rule, not a blanket failure)', () => {
  const r = runValidate(structuredClone(CAL), ['--date', projectDay().date]);
  assert.equal(r.status, 0, r.stderr);
});
