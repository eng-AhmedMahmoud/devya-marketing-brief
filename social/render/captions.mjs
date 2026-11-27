// Subtitles (SRT) for the daily vertical video. The video has no speech, so the
// cues carry the music description and the on-screen text in step with the
// animation in render-reel.mjs. Written next to the MP4 as reel-<lang>.srt and
// uploaded where the network takes a caption file (LinkedIn video). If a
// narration script exists (visuals/<date>/voice-<lang>.srt), it is used as is.

export const MAX_LINE = 42;
const MUSIC = { en: '[calm electronic music]', ar: '[موسيقى إلكترونية هادئة]' };
const END = 'devya.dev · @devyasoftware';

const plain = (s = '') => String(s).replace(/\*/g, '').replace(/\s+/g, ' ').trim();

// Greedy word wrap into lines of at most `max` characters.
export function wrap(text, max = MAX_LINE) {
  const lines = [];
  let line = '';
  for (const w of plain(text).split(' ')) {
    if (!line) line = w;
    else if ((line + ' ' + w).length <= max) line += ' ' + w;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines;
}

// Same timings as render-reel.mjs: title words from 0.9 s, 70 ms apart; the
// body 0.5 s after the last word; the card leaves at seconds-2.3; end card at seconds-1.9.
export function timeline(day, lang, seconds = 10) {
  const words = day.card[lang].title.split(/\s+/).length;
  const bodyStart = 0.9 + words * 0.07 + 0.5;
  return { titleStart: 0.9, bodyStart, cardOut: seconds - 2.3, endStart: seconds - 1.9, end: seconds };
}

function bodyText(day, lang) {
  const t = day.card[lang];
  const c = day.card;
  switch (day.layout) {
    case 'checklist': return (t.items || []).map(plain).join(' · ');
    case 'compare': return `${plain(t.right.label)}: ${t.right.items.map(plain).join(' · ')}`;
    case 'code': return (c.code || []).map((b) => plain(typeof b.label === 'object' ? b.label?.[lang] : b.label)).filter(Boolean).join(' · ');
    case 'terminal': return (c.terminal || []).filter((l) => l.startsWith('$ ')).map((l) => l.slice(2)).join(' · ');
    case 'product': return [t.sub, ...(t.items || [])].filter(Boolean).map(plain).join(' · ');
    default: return plain(t.sub || '');
  }
}

// [{start, end, text}] covering the whole video, never overlapping.
export function reelCues(day, lang, seconds = 10) {
  const tl = timeline(day, lang, seconds);
  const t = day.card[lang];
  const cues = [];
  const titleEnd = Math.min(tl.bodyStart + 1.6, tl.cardOut);
  cues.push({ start: 0.3, end: titleEnd, text: [MUSIC[lang] || MUSIC.en, ...wrap(t.title)].join('\n') });
  const body = bodyText(day, lang);
  if (body && titleEnd < tl.cardOut - 0.5) {
    const lines = wrap(body);
    const chunks = [];
    for (let i = 0; i < lines.length; i += 2) chunks.push(lines.slice(i, i + 2).join('\n'));
    const span = (tl.cardOut - titleEnd) / chunks.length;
    chunks.forEach((text, i) => cues.push({ start: titleEnd + i * span, end: titleEnd + (i + 1) * span, text }));
  }
  cues.push({ start: tl.endStart, end: tl.end, text: END });
  return cues;
}

const stamp = (s) => {
  const ms = Math.round(s * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};

export const toSrt = (cues) => cues.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`).join('\n');
