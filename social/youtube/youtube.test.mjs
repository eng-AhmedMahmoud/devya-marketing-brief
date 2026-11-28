// The YouTube track's metadata rules: every episode's title, description,
// tags, chapters and links, and the daily schedule.
//   node --test social/youtube/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  loadRegistry, youtubeProblems, episodeProblems, composeDescription, chapterProblems, tagsLength, ytLinkProblems,
  tagYt, campaign, stamp, scheduleGaps, projectLinkOf, TITLE_MAX,
} from './youtube.mjs';
import { captionLinks, linkBase, PROJECT_LINKS } from '../render/seo.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const reg = loadRegistry();
const long = () => structuredClone(reg.episodes.find((e) => e.kind === 'long' && e.project));
const plain = () => structuredClone(reg.episodes.find((e) => e.kind === 'long' && !e.project));
const CH = [{ t: 0, title: 'المقدمة' }, { t: 30, title: 'تاني' }, { t: 90, title: 'تالت' }];

test('the registry passes every rule', () => {
  assert.deepEqual(youtubeProblems(reg), []);
});

test('one upload a day at the slot, with no gaps in the schedule', () => {
  const days = reg.episodes.map((e) => e.publishAt.slice(0, 10));
  assert.equal(new Set(days).size, days.length);
  assert.deepEqual(scheduleGaps(reg), []);
  for (const e of reg.episodes) assert.equal(e.publishAt.slice(11), reg.slot);
});

test('every long-form has a script; every Short is a range of its parent\'s beats', () => {
  for (const e of reg.episodes) {
    if (e.kind === 'long') { JSON.parse(readFileSync(join(HERE, e.script), 'utf8')); continue; }
    const parent = reg.episodes.find((p) => p.slug === e.parent);
    const ids = JSON.parse(readFileSync(join(HERE, parent.script), 'utf8')).beats.map((b) => b.id);
    const [a, b] = e.beats;
    assert.ok(ids.indexOf(a) >= 0 && ids.indexOf(b) >= ids.indexOf(a), `${e.slug}: ${a}..${b}`);
  }
});

test('each long-form gets 2 or 3 Shorts', () => {
  for (const e of reg.episodes.filter((x) => x.kind === 'long')) {
    const n = reg.episodes.filter((x) => x.parent === e.slug).length;
    assert.ok(n >= 2 && n <= 3, `${e.slug}: ${n} Shorts`);
  }
});

test('a description carries the devya.dev link and the project link, UTM-tagged for YouTube', () => {
  const ep = long();
  const links = captionLinks(composeDescription(ep, { chapters: CH }));
  const p = projectLinkOf(ep);
  assert.ok(links.some((l) => linkBase(l) === linkBase(p)), 'project link');
  assert.ok(links.some((l) => new URL(l).hostname === 'www.devya.dev'), 'devya.dev link');
  for (const l of links) {
    const q = new URL(l).searchParams;
    assert.equal(q.get('utm_source'), 'youtube');
    assert.equal(q.get('utm_medium'), 'video');
    assert.equal(q.get('utm_campaign'), `yt-${ep.slug}`);
    assert.equal(q.get('utm_content'), 'long');
  }
});

test('a Short is tagged short, under its parent\'s campaign, and links its parent once uploaded', () => {
  const r = structuredClone(reg);
  const sh = r.episodes.find((e) => e.kind === 'short');
  assert.equal(campaign(sh), `yt-${sh.parent}`);
  assert.equal(new URL(tagYt('https://www.devya.dev/contact', sh)).searchParams.get('utm_content'), 'short');
  r.episodes.find((e) => e.slug === sh.parent).youtube.id = 'AbCdEfGhIjK';
  const desc = composeDescription(sh, { parentId: 'AbCdEfGhIjK' });
  assert.match(desc, /https:\/\/www\.youtube\.com\/watch\?v=AbCdEfGhIjK/);
  assert.deepEqual(episodeProblems(sh, r, { duration: 45 }), []);
  assert.ok(episodeProblems(sh, r, { duration: 75 }).some((m) => /Short runs/.test(m)));
});

test('missing links are caught: no devya.dev page, no project link', () => {
  const ep = long();
  ep.site = 'https://example.com/';
  assert.ok(episodeProblems(ep, reg).some((m) => /site must be a www\.devya\.dev page/.test(m)));
  const ep2 = long();
  ep2.project = 'not-a-project';
  assert.ok(episodeProblems(ep2, reg).some((m) => /no link in social\/projects\.json/.test(m)));
});

test('unfit links are refused: Vercel, untagged, off-site, a video off the channel', () => {
  const ep = long();
  assert.ok(ytLinkProblems('https://urania.vercel.app/?utm_source=youtube', ep).some((m) => /Vercel/.test(m)));
  assert.ok(ytLinkProblems('https://www.devya.dev/contact', ep).some((m) => /utm_source should be youtube/.test(m)));
  assert.ok(ytLinkProblems(tagYt('https://example.com/x', ep), ep).some((m) => /outside devya\.dev/.test(m)));
  assert.ok(ytLinkProblems('https://www.youtube.com/watch?v=dQw4w9WgXcQ', ep).some((m) => /not a Devya-channel video/.test(m)));
  assert.deepEqual(ytLinkProblems('https://www.youtube.com/watch?v=GsNGR6vv_eU', ep), []);
  assert.deepEqual(ytLinkProblems(tagYt([...PROJECT_LINKS.values()][0], ep), ep), []);
  const bad = long();
  bad.description.lead = ['شرح Claude Code: https://urania.vercel.app/'];
  assert.ok(episodeProblems(bad, reg).some((m) => /Vercel/.test(m)));
});

test('titles: length, angle brackets, keyword in the visible part, Devya spelled right', () => {
  const ep = plain();
  ep.title = 'x'.repeat(TITLE_MAX + 1);
  assert.ok(episodeProblems(ep, reg).some((m) => /title is 101 characters/.test(m)));
  ep.title = 'Next.js <script> على VPS';
  assert.ok(episodeProblems(ep, reg).some((m) => /< or >/.test(m)));
  ep.title = 'فيديو جديد عن السيرفرات والحاجات اللي بنعملها كل يوم في الشغل وبعدين Next.js';
  assert.ok(episodeProblems(ep, reg).some((m) => /first 60 characters/.test(m)));
  ep.title = 'رفع مشروع Next.js مع DEVYA';
  assert.ok(episodeProblems(ep, reg).some((m) => /"DEVYA" should be "Devya"/.test(m)));
});

test('tags: count, YouTube\'s 500-character budget, no duplicates; hashtags include #BuildWithDevya', () => {
  assert.equal(tagsLength(['a b', 'cd']), 3 + 2 + 2 + 1);
  const ep = plain();
  ep.tags = Array.from({ length: 20 }, (_, i) => `tag number ${i} that is long enough to matter`);
  assert.ok(episodeProblems(ep, reg).some((m) => /YouTube allows 500/.test(m)));
  const ep2 = plain();
  ep2.tags = [...ep2.tags, ep2.tags[0].toUpperCase()];
  assert.ok(episodeProblems(ep2, reg).some((m) => /duplicate tags/.test(m)));
  const ep3 = plain();
  ep3.hashtags = ['#NextJS', '#Docker'];
  assert.ok(episodeProblems(ep3, reg).some((m) => /#BuildWithDevya/.test(m)));
});

test('chapters: start at 0:00, at least three, each 10 s or longer, in order', () => {
  assert.deepEqual(chapterProblems(CH, 200), []);
  assert.ok(chapterProblems([{ t: 5, title: 'a' }, ...CH.slice(1)], 200).some((m) => /not 0:00/.test(m)));
  assert.ok(chapterProblems(CH.slice(0, 2), 200).some((m) => /at least 3/.test(m)));
  assert.ok(chapterProblems([...CH, { t: 95, title: 'قصير' }], 200).some((m) => /lasts 5\.0 s/.test(m)));
  assert.ok(chapterProblems([CH[0], CH[2], CH[1]], 200).some((m) => /does not start after/.test(m)));
  assert.equal(stamp(0), '0:00');
  assert.equal(stamp(605.9), '10:05');
  assert.equal(stamp(3725), '1:02:05');
});

test('the schedule: two uploads on one day, or off the slot, are refused', () => {
  const r = structuredClone(reg);
  r.episodes[1].publishAt = r.episodes[0].publishAt;
  assert.ok(youtubeProblems(r).some((p) => /two uploads on/.test(p.msg)));
  const r2 = structuredClone(reg);
  r2.episodes[0].publishAt = r2.episodes[0].publishAt.slice(0, 11) + '08:00';
  assert.ok(youtubeProblems(r2).some((p) => /slot/.test(p.msg)));
});

test('validate.mjs covers YouTube: a broken episode fails the calendar gate', () => {
  const dir = mkdtempSync(join(tmpdir(), 'devya-yt-'));
  try {
    const r = structuredClone(reg);
    r.episodes[0].site = 'https://www.devya.dev/projects/devya-xray';
    r.episodes[0].description.lead = ['شرح Claude Code بالعربي: https://example.com/'];
    const f = join(dir, 'episodes.json');
    writeFileSync(f, JSON.stringify(r));
    const res = spawnSync(process.execPath, [join(HERE, '..', 'render', 'validate.mjs'), '--youtube', f], { encoding: 'utf8' });
    assert.equal(res.status, 1, res.stdout);
    assert.match(res.stderr, /youtube claude-code-workflow: .*outside devya\.dev/);
    const ok = spawnSync(process.execPath, [join(HERE, '..', 'render', 'validate.mjs')], { encoding: 'utf8' });
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /YouTube episodes pass/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
