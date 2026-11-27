// Audit of published and scheduled posts (audit.mjs). node --test social/render/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixCaption, fixHashtags, captionProblems, auditPublished, MOVED } from './audit.mjs';
import { hashtags, captionLinks, campaignSlug } from './seo.mjs';

const SOCIAL = join(dirname(fileURLToPath(import.meta.url)), '..');
const CAL = JSON.parse(readFileSync(join(SOCIAL, 'calendar.json'), 'utf8'));
const STATE = JSON.parse(readFileSync(join(SOCIAL, 'state.json'), 'utf8'));
const rows = auditPublished(CAL, STATE, { today: '2026-11-28' });

test('every published post is audited, and every one made before 2026-11-28 falls short (old template or silent video)', () => {
  const published = Object.values(STATE.published).reduce((n, nets) => n + Object.keys(nets).length, 0);
  assert.equal(rows.length, published);
  for (const r of rows.filter((x) => x.date < '2026-11-28')) assert.ok(r.issues.length, `${r.date} ${r.network}`);
});

test('corrected captions pass the link checker and hashtag rules, keep the copy and only touch links and hashtags', () => {
  let edits = 0;
  for (const r of rows) for (const a of r.actions.filter((x) => x.type === 'edit-caption')) {
    edits++;
    assert.deepEqual(a.remaining, [], `${r.date} ${r.network}`);
    const day = CAL.days.find((d) => d.date === r.date);
    const original = day.posts[r.network]?.caption ?? day.reels[r.network.split('_')[0]].caption;
    const strip = (s) => s.replace(/https?:\/\/\S+/g, 'URL').replace(/#[\p{L}\p{N}_]+/gu, '').replace(/\s+/g, ' ').trim();
    assert.equal(strip(a.caption), strip(original), `${r.date} ${r.network}: copy unchanged`);
    for (const u of captionLinks(a.caption)) assert.ok(u.includes(`utm_campaign=${campaignSlug(day)}`), u);
  }
  assert.ok(edits > 0);
});

test('what each platform can fix in place', () => {
  const by = (net) => rows.filter((r) => r.network === net && r.date < '2026-11-28');
  for (const r of by('facebook_reel')) assert.ok(r.actions.some((a) => a.type === 'replace-video' && a.inPlace), r.date);
  for (const net of ['instagram_reel', 'linkedin_video', 'linkedin', 'facebook', 'instagram']) for (const r of by(net)) assert.ok(r.actions.some((a) => a.type === 'repost-needed' && !a.inPlace && a.recommendation), `${net} ${r.date}`);
  for (const r of by('facebook_story')) assert.ok(r.actions.every((a) => a.type === 'none'), r.date);
  for (const r of rows) for (const a of r.actions) if (a.type === 'edit-caption') assert.equal(a.inPlace, true);
});

test('moved pages are re-pointed and tagged', () => {
  const day = { date: '2026-11-16', topic: 'Ask for a v1 cut line', posts: { linkedin: { caption: 'x' } } };
  const fixed = fixCaption(day, 'facebook', 'Read https://www.devya.dev/services?utm_source=facebook&utm_medium=social');
  assert.match(fixed, /https:\/\/www\.devya\.dev\/solutions\?utm_source=facebook&utm_medium=social&utm_campaign=2026-11-16-ask-for-a-v1-cut-line/);
  assert.deepEqual(captionProblems(day, 'facebook', fixed), []);
  assert.ok(MOVED['https://www.devya.dev/services']);
});

test('fixHashtags trims to the cap with #BuildWithDevya first, and adds tags when there are none', () => {
  assert.equal(fixHashtags('Hi.\n\n#A #B #C #D #E #BuildWithDevya #F', [3, 5]), 'Hi.\n\n#BuildWithDevya #A #B #C #D');
  assert.equal(fixHashtags('Hi.\nhttps://x.y', [1, 3], ['#One', '#Two']), 'Hi.\nhttps://x.y\n\n#BuildWithDevya #One #Two');
  assert.equal(hashtags(fixHashtags('Line\n\n#BuildWithDevya #A', [3, 5], ['#X'])).length, 2, 'never invents tags beyond the caption\'s own');
});
