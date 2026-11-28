// The timeline: where takes sit, when the screen changes (on the word that
// names the thing), chapters, captions; and the scripts themselves follow the
// narration rules from the developer's lesson kit (STYLE.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  place, screenStates, chapters, chunks, twoLines, captionCues, cueProblems, toSrt, longForm, shortForm, segments,
  LEAD_IN, PAUSE, SLIDE_PAUSE, SLIDE_LEAD, END_CARD, CUE_CHARS,
} from './timeline.mjs';
import { loadRegistry } from './youtube.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const reg = loadRegistry();
const scripts = reg.episodes.filter((e) => e.kind === 'long').map((e) => JSON.parse(readFileSync(join(HERE, e.script), 'utf8')));

// A take whose characters are spoken evenly, 0.07 s each, after 0.1 s.
const fakeTake = (text) => ({ dur: 0.2 + text.length * 0.07, starts: [...text].map((_, i) => 0.1 + i * 0.07), ends: [...text].map((_, i) => 0.17 + i * 0.07) });
const takesFor = (script) => Object.fromEntries(script.beats.map((b) => [b.id, fakeTake(b.text)]));

const mini = {
  slug: 'mini', lang: 'ar',
  slides: { s1: { type: 'hook', chapter: 'أول', title: 'x' }, s2: { type: 'bullets', chapter: 'تاني', items: [{ k: 'a', text: 'a' }, { k: 'b', text: 'b' }] } },
  beats: [
    { id: 'B01', slide: 's1', text: 'جملة أولى طويلة بما فيه الكفاية عشان تبقى take حقيقية في الفيديو ده.' },
    { id: 'B02', slide: 's2', text: 'هنا بنتكلم عن البند الأول، وبعدين البند التاني على طول.', show: ['a'], focus: 'a', marks: [{ at: 'البند التاني', show: ['b'], focus: 'b' }] },
    { id: 'B03', slide: 's2', text: 'وده آخر كلام في السلايد دي، عشان نقفل الكلام كويس.', show: ['*'] },
  ],
};

test('beats follow one another with the pause for their kind of join', () => {
  const tk = takesFor(mini);
  const p = place(mini.beats, tk);
  assert.equal(p.beats[0].t0, LEAD_IN);
  assert.ok(Math.abs(p.beats[1].t0 - (p.beats[0].t1 + SLIDE_PAUSE)) < 1e-6);
  assert.ok(Math.abs(p.beats[2].t0 - (p.beats[1].t1 + PAUSE)) < 1e-6);
  assert.throws(() => place(mini.beats, {}), /no take for B01/);
});

test('the screen turns to a new slide just before its first word, and a mark fires on its word', () => {
  const tk = takesFor(mini);
  const p = place(mini.beats, tk);
  const { states, problems } = screenStates(mini, p);
  assert.deepEqual(problems, []);
  assert.equal(states[0].t, 0);
  const s2 = states.find((s) => s.slide === 's2');
  assert.ok(Math.abs(s2.t - (p.beats[1].t0 - SLIDE_LEAD)) < 1e-6);
  assert.deepEqual(s2.show, ['a']);
  const mark = states.find((s) => s.focus === 'b');
  const k = mini.beats[1].text.indexOf('البند التاني');
  assert.ok(Math.abs(mark.t - (p.beats[1].t0 + tk.B02.starts[k])) < 1e-3);
  assert.deepEqual(mark.show, ['a', 'b']);
});

test('a mark whose words are not in its beat is reported', () => {
  const bad = structuredClone(mini);
  bad.beats[1].marks[0].at = 'كلام مش موجود';
  const { problems } = screenStates(bad, place(bad.beats, takesFor(bad)));
  assert.ok(problems.some((m) => /not in the beat's text/.test(m)));
});

test('chapters: one per chaptered slide, the first at 0:00', () => {
  const tl = longForm(mini, takesFor(mini));
  assert.deepEqual(tl.chapters.map((c) => c.title), ['أول', 'تاني']);
  assert.equal(tl.chapters[0].t, 0);
  assert.ok(Math.abs(tl.duration - (tl.speechEnd + 0.6 + END_CARD)) < 1e-6);
  assert.equal(tl.states.at(-1).slide, 'end');
});

test('captions: at most two lines, never overlapping, every beat covered, valid SRT', () => {
  for (const script of scripts) {
    const tl = longForm(script, takesFor(script));
    assert.deepEqual(cueProblems(tl.cues, tl.duration), [], script.slug);
    for (const b of tl.placed.beats) assert.ok(tl.cues.some((c) => c.start >= b.t0 - 0.01 && c.start <= b.t1), `${script.slug} ${b.id}`);
    const srt = toSrt(tl.cues);
    assert.match(srt, /^1\n00:00:00,\d{3} --> 00:00:\d{2},\d{3}\n/);
  }
  for (const c of chunks('كلمة '.repeat(60).trim())) assert.ok(c.b - c.a <= CUE_CHARS * 2);
  assert.equal(twoLines('قصيرة'), 'قصيرة');
  assert.equal(twoLines('a '.repeat(30).trim()).split('\n').length, 2);
});

test('a Short is its beats on their own, starting at once', () => {
  const s = scripts[0];
  const sh = reg.episodes.find((e) => e.parent === s.slug);
  const sf = shortForm(s, takesFor(s), sh.beats);
  assert.equal(sf.placed.beats[0].id, sh.beats[0]);
  assert.equal(sf.placed.beats.at(-1).id, sh.beats[1]);
  assert.ok(sf.placed.beats[0].t0 < 0.2);
  assert.equal(sf.states[0].t, 0);
  assert.throws(() => shortForm(s, takesFor(s), ['B99', 'B01']), /not a range/);
});

test('segments cover the whole video with no gap', () => {
  const tl = longForm(mini, takesFor(mini));
  const sg = segments(tl.states, tl.duration);
  const total = sg.reduce((n, s) => n + s.dur, 0);
  assert.ok(Math.abs(total - tl.duration) < 0.01);
});

// --- the scripts themselves ---------------------------------------------------

test('every script is internally consistent: slides exist, keys exist, marks are in their text', () => {
  for (const s of scripts) {
    for (const b of s.beats) {
      const slide = s.slides[b.slide];
      assert.ok(slide, `${s.slug} ${b.id}: slide ${b.slide}`);
      const keys = new Set(JSON.stringify(slide).match(/"k":"[^"]+"|"(sub|kicker)Key":"[^"]+"/g)?.map((m) => m.split(':')[1].replace(/"/g, '')) || []);
      for (const k of [...(b.show || []), ...(b.marks || []).flatMap((m) => m.show || []), b.focus, ...(b.marks || []).map((m) => m.focus)].filter((x) => x && x !== '*')) assert.ok(keys.has(k), `${s.slug} ${b.id}: key ${k} not on ${b.slide}`);
      for (const m of b.marks || []) assert.ok(b.text.includes(m.at), `${s.slug} ${b.id}: mark "${m.at}"`);
    }
    const { problems } = screenStates(s, place(s.beats, takesFor(s)));
    assert.deepEqual(problems, [], s.slug);
    assert.equal(new Set(s.beats.map((b) => b.id)).size, s.beats.length, `${s.slug}: duplicate beat ids`);
  }
});

test('scripts follow the narration rules (lesson kit STYLE.md)', () => {
  for (const s of scripts) {
    const all = s.beats.map((b) => b.text).join(' ');
    // No beat under ~100 characters: short takes come out in a higher register.
    for (const b of s.beats) assert.ok(b.text.length >= 95, `${s.slug} ${b.id} is ${b.text.length} characters`);
    // "تمام؟" once a video, at most.
    assert.ok((all.match(/تمام؟/g) || []).length <= 1, `${s.slug}: تمام؟ more than once`);
    // A colon between two Latin words is read aloud.
    assert.ok(!/[A-Za-z]:\s*[A-Za-z]/.test(all.replace(/https?:\/\/\S+/g, '').replace(/node:22-alpine/g, '')), `${s.slug}: colon between Latin words`);
    // Numbers before a noun take the long form (تلاتة, not تلات).
    assert.ok(!/(^|\s)(تلات|خمس|سبع|أربع)\s(?!و)/.test(all.replace(/خمس خطوات/g, '')), `${s.slug}: short number form`);
    // "Devya" in Latin script, never ديفيا.
    assert.ok(!/ديفيا/.test(all), `${s.slug}: ديفيا`);
    // Slides are feminine: never "السلايد ده".
    assert.ok(!/السلايد ده/.test(all), `${s.slug}: السلايد ده`);
  }
});
