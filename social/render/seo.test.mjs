// Link tagging, link validation and caption SEO rules (seo.mjs, compose.mjs,
// validate.mjs). node --test social/render/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  RULES_FROM, campaignSlug, tagUrl, linkProblems, captionLinks, keywordLed, namingProblems,
  altText, altProblems, tagDayLinks, allowedPages, hashtags, linkBase,
} from './seo.mjs';
import { composeReels } from './compose.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CAL = JSON.parse(readFileSync(join(HERE, '..', 'calendar.json'), 'utf8'));
const modernDay = () => structuredClone(CAL.days.find((d) => d.date >= RULES_FROM && d.posts.facebook.caption.includes('https://')));

test('campaign slug: date + topic words, kebab-case, at most 60 chars', () => {
  const slug = campaignSlug({ date: '2026-11-28', topic: 'Stop adding Postgres indexes by guesswork: EXPLAIN ANALYZE' });
  assert.match(slug, /^2026-11-28-stop-adding-postgres-indexes/);
  assert.ok(slug.length <= 60, slug);
  assert.match(slug, /^[a-z0-9-]+$/);
  assert.doesNotMatch(slug, /-$/);
  assert.equal(campaignSlug({ date: '2026-12-01', topic: 'Devya Converse: AI chat' }), '2026-12-01-devya-converse-ai-chat');
});

test('tagUrl adds source/medium/campaign (+content), replaces old tags, keeps other params', () => {
  const u = new URL(tagUrl('https://www.devya.dev/contact?utm_source=x&ref=a', { platform: 'facebook', campaign: '2026-11-29-demo', content: 'reel' }));
  assert.equal(u.searchParams.get('utm_source'), 'facebook');
  assert.equal(u.searchParams.get('utm_medium'), 'social');
  assert.equal(u.searchParams.get('utm_campaign'), '2026-11-29-demo');
  assert.equal(u.searchParams.get('utm_content'), 'reel');
  assert.equal(u.searchParams.get('ref'), 'a');
  assert.equal(u.searchParams.getAll('utm_source').length, 1);
  assert.equal(new URL(tagUrl('https://www.devya.dev/x', { platform: 'linkedin', campaign: 'c' })).searchParams.has('utm_content'), false);
});

test('linkProblems: a tagged devya.dev link passes; untagged, Vercel, off-site, http and wrong tags fail', () => {
  const opts = { platform: 'linkedin', campaign: '2026-11-30-jwt' };
  const good = 'https://www.devya.dev/projects/jwt-inspector?utm_source=linkedin&utm_medium=social&utm_campaign=2026-11-30-jwt';
  assert.deepEqual(linkProblems(good, opts), []);
  assert.deepEqual(linkProblems('https://og.devya.dev/?utm_source=linkedin&utm_medium=social&utm_campaign=2026-11-30-jwt', opts), [], 'product host');
  assert.match(linkProblems('https://www.devya.dev/projects/jwt-inspector', opts).join(), /untagged link/);
  assert.match(linkProblems('https://urania.vercel.app/?utm_source=linkedin&utm_medium=social&utm_campaign=2026-11-30-jwt', opts).join(), /Vercel/);
  assert.match(linkProblems('https://x.now.sh/', opts).join(), /Vercel/);
  assert.match(linkProblems('https://example.com/?utm_source=linkedin&utm_medium=social&utm_campaign=2026-11-30-jwt', opts).join(), /outside devya\.dev/);
  assert.match(linkProblems('https://devya.dev.evil.com/?utm_source=linkedin&utm_medium=social&utm_campaign=2026-11-30-jwt', opts).join(), /outside devya\.dev/);
  assert.match(linkProblems(good.replace('https:', 'http:'), opts).join(), /not https/);
  assert.match(linkProblems(good.replace('utm_source=linkedin', 'utm_source=facebook'), opts).join(), /utm_source should be linkedin/);
  assert.match(linkProblems(good.replace('utm_medium=social', 'utm_medium=cpc'), opts).join(), /utm_medium should be social/);
  assert.match(linkProblems(good.replace('&utm_campaign=2026-11-30-jwt', ''), opts).join(), /utm_campaign should be/);
  assert.match(linkProblems(good, { ...opts, content: 'reel' }).join(), /utm_content should be reel/);
});

test('captionLinks drops trailing punctuation, Latin and Arabic', () => {
  assert.deepEqual(captionLinks('See https://www.devya.dev/contact?utm_source=x. Or (https://og.devya.dev/), thanks'), ['https://www.devya.dev/contact?utm_source=x', 'https://og.devya.dev/']);
  assert.deepEqual(captionLinks('التفاصيل: https://www.devya.dev/x؟ و«https://www.devya.dev/y»، ثم “https://www.devya.dev/z”'), ['https://www.devya.dev/x', 'https://www.devya.dev/y', 'https://www.devya.dev/z']);
});

test('tagDayLinks tags a link that appears twice, and keeps trailing punctuation outside it', () => {
  const day = { date: '2026-12-09', topic: 'Twice', posts: { facebook: { lang: 'ar', caption: 'أ https://www.devya.dev/contact؟ ب https://www.devya.dev/contact' } } };
  const cap = tagDayLinks(day).posts.facebook.caption;
  const tagged = 'https://www.devya.dev/contact?utm_source=facebook&utm_medium=social&utm_campaign=2026-12-09-twice';
  assert.equal(cap, `أ ${tagged}؟ ب ${tagged}`);
});

test('tagDayLinks tags devya.dev links per network and leaves others for the validator', () => {
  const day = { date: '2026-12-09', topic: 'Test topic', posts: {
    linkedin: { lang: 'en', caption: 'Read https://www.devya.dev/blogs/x' },
    facebook: { lang: 'ar', caption: 'التفاصيل: https://www.devya.dev/contact\n\n#BuildWithDevya' },
    instagram: { lang: 'en', caption: 'bad https://x.vercel.app/' },
  } };
  const t = tagDayLinks(day);
  assert.equal(captionLinks(t.posts.linkedin.caption)[0], 'https://www.devya.dev/blogs/x?utm_source=linkedin&utm_medium=social&utm_campaign=2026-12-09-test-topic');
  assert.equal(captionLinks(t.posts.facebook.caption)[0], 'https://www.devya.dev/contact?utm_source=facebook&utm_medium=social&utm_campaign=2026-12-09-test-topic');
  assert.equal(t.posts.instagram.caption, 'bad https://x.vercel.app/');
});

test('allowedPages: source, contact, the product shown and day.links', () => {
  const pages = allowedPages({ source: 'https://www.devya.dev/converse', card: { shot: 'https://og.devya.dev' }, links: ['https://www.devya.dev/projects'] });
  assert.deepEqual([...pages].sort(), ['https://og.devya.dev', 'https://www.devya.dev/contact', 'https://www.devya.dev/converse', 'https://www.devya.dev/projects']);
  assert.equal(linkBase('https://www.devya.dev/converse/?utm_source=a'), 'https://www.devya.dev/converse');
});

test('keyword-led first line, case- and diacritic-insensitive', () => {
  assert.equal(keywordLed('Stop adding PostgreSQL indexes by guesswork.\n\nMore', ['postgresql']), true);
  assert.equal(keywordLed('Intro line without it.\nPostgreSQL later', ['PostgreSQL']), false);
  assert.equal(keywordLed('توقف عن إضافة الفهارس بالتخمين.', ['الفهارس']), true);
  assert.equal(keywordLed('رمز الدخول JWT مُرمَّز', ['مرمز']), true);
  assert.equal(keywordLed('anything', []), false);
  assert.equal(keywordLed('Check your email settings', ['ai']), false, 'Latin keywords start a word');
  assert.equal(keywordLed('Rapid answers', ['api']), false);
  assert.equal(keywordLed('Stop adding indexes', ['index']), true, 'plural still counts');
  assert.equal(keywordLed('AI chat that answers', ['ai chat']), true);
});

test('naming: Devya in Latin script, one spelling, products as devya.dev names them', () => {
  assert.deepEqual(namingProblems('Devya builds og-preview and Devya Converse. https://www.devya.dev/x #BuildWithDevya @devyasoftware devya.dev'), []);
  assert.match(namingProblems('من منتجات ديفيا').join(), /Latin script/);
  assert.match(namingProblems('DEVYA ships').join(), /"DEVYA" should be "Devya"/);
  assert.match(namingProblems('devya ships').join(), /"devya" should be "Devya"/);
  assert.match(namingProblems('Devya Solutions ships').join(), /call the company "Devya"/);
  assert.match(namingProblems('Try OG Preview').join(), /"OG Preview" should be "og-preview"/);
  assert.match(namingProblems('Copyforge writes').join(), /should be "CopyForge"/);
  assert.deepEqual(namingProblems('run a contrast check on grey text'), [], 'ordinary prose is fine');
});

test('alt text: names Devya, the card title and detail, never over 250 chars', () => {
  const day = modernDay();
  for (const lang of ['en', 'ar']) {
    const alt = altText(day, lang);
    assert.deepEqual(altProblems(alt), [], alt);
    assert.ok(alt.includes(day.card[lang].title.replace(/\*/g, '')), alt);
    assert.doesNotMatch(alt, /\*/);
  }
  const long = altText({ card: { en: { title: 'T', sub: 'word '.repeat(80) } } }, 'en');
  assert.ok(long.length <= 250 && long.endsWith('…'), long.length);
  assert.match(altProblems('').join(), /missing/);
  assert.match(altProblems('A card with a title but no brand name').join(), /name Devya/);
});

test('composeReels: Facebook Reel link tagged with campaign + utm_content=reel; hashtag counts in range', () => {
  const day = modernDay();
  const { reels } = composeReels(day);
  const [link] = captionLinks(reels.facebook.caption);
  assert.deepEqual(linkProblems(link, { platform: 'facebook', campaign: campaignSlug(day), content: 'reel' }), []);
  assert.equal(captionLinks(reels.instagram.caption).length, 0);
  assert.equal(captionLinks(reels.linkedin.caption).length, 0);
  const n = (s) => hashtags(s).length;
  assert.ok(n(reels.instagram.caption) >= 3 && n(reels.instagram.caption) <= 5);
  assert.ok(n(reels.facebook.caption) >= 1 && n(reels.facebook.caption) <= 3);
  assert.ok(n(reels.linkedin.caption) >= 1 && n(reels.linkedin.caption) <= 3);
});

// The build gate: validate.mjs exits 1 on an untagged or Vercel link.
const runValidate = (cal, extra = []) => {
  const dir = mkdtempSync(join(tmpdir(), 'devya-validate-'));
  try {
    const f = join(dir, 'calendar.json');
    writeFileSync(f, JSON.stringify(cal));
    return spawnSync(process.execPath, [join(HERE, 'validate.mjs'), '--calendar', f, ...extra], { encoding: 'utf8' });
  } finally { rmSync(dir, { recursive: true, force: true }); }
};

test('validate.mjs passes the real calendar', () => {
  const r = spawnSync(process.execPath, [join(HERE, 'validate.mjs')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('validate.mjs fails the build on an untagged link', () => {
  const cal = structuredClone(CAL);
  const day = cal.days.find((d) => d.date === modernDay().date);
  day.posts.facebook.caption = day.posts.facebook.caption.replace(/\?utm_[^\s]+/, '');
  const r = runValidate(cal, ['--date', day.date]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /facebook: untagged link/);
});

test('validate.mjs fails the build on a Vercel link, in a caption or a reel', () => {
  const cal = structuredClone(CAL);
  const day = cal.days.find((d) => d.date === modernDay().date);
  day.reels.facebook.caption = day.reels.facebook.caption.replace(/https:\/\/www\.devya\.dev/, 'https://devya.vercel.app');
  const r = runValidate(cal, ['--date', day.date]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Vercel/);
});

test('validate.mjs fails a day with a missing campaign tag, too many Instagram hashtags or an off-brand accent', () => {
  const cal = structuredClone(CAL);
  const day = cal.days.find((d) => d.date === modernDay().date);
  day.posts.facebook.caption = day.posts.facebook.caption.replace(/&utm_campaign=[^\s&]+/, '');
  day.posts.instagram.caption += ' #One #Two #Three';
  day.accent = 'ember';
  const r = runValidate(cal, ['--date', day.date]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /utm_campaign should be/);
  assert.match(r.stderr, /instagram: \d+ hashtags, want 3-5/);
  assert.match(r.stderr, /accent "ember"/);
});

test('validate.mjs --date only reports that day', () => {
  const cal = structuredClone(CAL);
  const days = cal.days.filter((d) => d.date >= RULES_FROM);
  days[0].posts.facebook.caption = days[0].posts.facebook.caption.replace(/\?utm_[^\s]+/, '');
  assert.equal(runValidate(cal, ['--date', days[1].date]).status, 0);
  assert.equal(runValidate(cal, ['--date', days[0].date]).status, 1);
});

// Devya YouTube channel videos (social/videos.json).
import { DEVYA_VIDEOS, CHANNEL, youtubeId, videoUrl } from './seo.mjs';

test('video registry: Devya channel videos with 11-character ids', () => {
  assert.equal(CHANNEL.id, 'UCr3NVqdbc_31pUVYSJSVUmQ');
  assert.equal(CHANNEL.handle, '@DevyaSolutions');
  assert.ok(DEVYA_VIDEOS.size >= 4);
  for (const [id, v] of DEVYA_VIDEOS) { assert.match(id, /^[\w-]{11}$/); assert.ok(v.title && v.product, id); }
});

test('youtubeId and linkBase understand watch, youtu.be, shorts and embed links', () => {
  for (const u of ['https://www.youtube.com/watch?v=lvcq-RFultk&t=4', 'https://youtu.be/lvcq-RFultk', 'https://youtube.com/shorts/lvcq-RFultk', 'https://www.youtube.com/embed/lvcq-RFultk']) assert.equal(youtubeId(u), 'lvcq-RFultk', u);
  assert.equal(youtubeId('https://www.devya.dev/watch?v=lvcq-RFultk'), null);
  assert.equal(linkBase('https://www.youtube.com/watch?v=lvcq-RFultk&utm_source=x'), 'https://www.youtube.com/watch?v=lvcq-RFultk');
  assert.equal(videoUrl('lvcq-RFultk'), 'https://www.youtube.com/watch?v=lvcq-RFultk');
});

test('linkProblems: only tagged, canonical links to Devya-channel videos pass', () => {
  const opts = { platform: 'facebook', campaign: 'c' };
  const tagged = (u) => tagUrl(u, opts);
  assert.deepEqual(linkProblems(tagged('https://www.youtube.com/watch?v=lvcq-RFultk'), opts), []);
  assert.match(linkProblems('https://www.youtube.com/watch?v=lvcq-RFultk', opts).join(), /untagged link/);
  assert.match(linkProblems(tagged('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), opts).join(), /not a video on Devya's channel/);
  assert.match(linkProblems(tagged('https://youtu.be/lvcq-RFultk'), opts).join(), /canonical https:\/\/www\.youtube\.com\/watch\?v=lvcq-RFultk/);
  assert.match(linkProblems(tagged('https://www.youtube.com/@DevyaSolutions'), opts).join(), /not a video on Devya's channel/);
});

test('tagDayLinks turns a Devya youtu.be link into the tagged canonical watch URL and leaves other videos alone', () => {
  const day = { date: '2026-12-20', topic: 'Video', posts: { facebook: { lang: 'en', caption: 'Watch https://youtu.be/lvcq-RFultk and https://youtu.be/dQw4w9WgXcQ' } } };
  const cap = tagDayLinks(day).posts.facebook.caption;
  assert.ok(cap.includes('https://www.youtube.com/watch?v=lvcq-RFultk&utm_source=facebook&utm_medium=social&utm_campaign=2026-12-20-video'), cap);
  assert.ok(cap.includes('https://youtu.be/dQw4w9WgXcQ'), cap);
});

test('video days: the video must be a Devya-channel video, and Facebook/LinkedIn must link it', () => {
  const cal = structuredClone(CAL);
  const day = cal.days.find((d) => d.video);
  assert.ok(day, 'calendar has at least one video day');
  assert.equal(runValidate(cal, ['--date', day.date]).status, 0);
  const other = structuredClone(cal);
  other.days.find((d) => d.date === day.date).video = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  assert.match(runValidate(other, ['--date', day.date]).stderr, /video .* of a video on Devya's channel/);
  const wrong = structuredClone(cal);
  const w = wrong.days.find((d) => d.date === day.date);
  w.posts.facebook.caption = w.posts.facebook.caption.replace(/https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}/, 'https://www.youtube.com/watch?v=OPKty5IFgss');
  assert.match(runValidate(wrong, ['--date', day.date]).stderr, /facebook: a video day links its video/);
});
