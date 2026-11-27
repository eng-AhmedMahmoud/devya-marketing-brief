// Video subtitles (captions.mjs). node --test social/render/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reelCues, toSrt, wrap, MAX_LINE } from './captions.mjs';

const CAL = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'calendar.json'), 'utf8'));

test('cues for every day and language: in order, no overlap, inside 10 s, short lines, end card last', () => {
  for (const day of CAL.days) {
    for (const lang of ['en', 'ar']) {
      const cues = reelCues(day, lang, 10);
      assert.ok(cues.length >= 2, day.date);
      let prev = 0;
      for (const c of cues) {
        assert.ok(c.start >= prev - 1e-9 && c.end > c.start && c.end <= 10, `${day.date} ${lang} ${JSON.stringify(c)}`);
        prev = c.end;
        for (const line of c.text.split('\n')) assert.ok(line.length <= MAX_LINE || !line.includes(' '), `${day.date} ${lang}: "${line}"`);
        assert.doesNotMatch(c.text, /\*/);
      }
      assert.match(cues[0].text, lang === 'ar' ? /موسيقى/ : /music/);
      assert.equal(cues.at(-1).text, 'devya.dev · @devyasoftware');
    }
  }
});

test('SRT format', () => {
  const srt = toSrt([{ start: 0.3, end: 3.35, text: 'a\nb' }, { start: 8.1, end: 10, text: 'c' }]);
  assert.equal(srt, '1\n00:00:00,300 --> 00:00:03,350\na\nb\n\n2\n00:00:08,100 --> 00:00:10,000\nc\n');
});

test('wrap keeps words whole', () => {
  assert.deepEqual(wrap('one two three', 7), ['one two', 'three']);
  assert.deepEqual(wrap('*Stop* adding  indexes'), ['Stop adding indexes']);
});
