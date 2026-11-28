// Narration in the developer's cloned voice: his Professional Voice Clone on
// ElevenLabs, the same voice, model and settings as the Catalyst lesson kit
// (Catalystsw/lesson-video-kit: tts_eleven.py, VOICE-SETUP.md).
//
//   account   the Devya Solutions ElevenLabs account. Its API key is read from
//             the macOS Keychain (service "Devya Solutions ElevenLabs") or
//             ELEVENLABS_API_KEY; it is never printed, logged or written.
//   voice     the PVC id from the kit's voice state file (VOICE_STATE, default
//             ~/Projects/catalyst/_internal/video/voice/voice.constra.json), so
//             no voice id lives in this public repo.
//   model     eleven_v4, language ar, stability 0.5, similarity 0.85, speaker
//             boost, clone strength 0.3: the raw professional voice the
//             developer approved ("perfect"), no pitch or tone processing.
//
// Each beat is one take with character timings (with-timestamps), and the
// neighbouring beats go as previous/next text so the joins sound like one
// take. A take is kept until its text, spelling or voice changes.
// Before anything is sent, the characters it would cost are checked against
// the account's remaining credits (quotaPlan): if the plan would need paying
// for, nothing is sent and the run stops (QuotaExceeded).

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { YT_DIR } from './youtube.mjs';

export const API = 'https://api.elevenlabs.io';
export const KEYCHAIN_SERVICE = 'Devya Solutions ElevenLabs';
export const DEFAULT_VOICE_STATE = join(homedir(), 'Projects/catalyst/_internal/video/voice/voice.constra.json');
export const DEFAULT_LEXICON = join(homedir(), 'Projects/catalyst/_internal/video/lessons/lexicon.json');
export const SETTINGS = { stability: 0.5, similarity_boost: 0.85, use_speaker_boost: true, clone_strength: 0.3 };
export const MODEL = 'eleven_v4';
export const FORMAT = 'mp3_44100_192';
// Credits kept back for the developer's other work on the account.
export const RESERVE = 5000;

export class QuotaExceeded extends Error {
  constructor(plan) {
    super(`QUOTA: this narration needs ${plan.needed.toLocaleString()} credits; the account has ${plan.remaining.toLocaleString()} left (${plan.reserve.toLocaleString()} kept in reserve), resetting ${plan.resets}. Nothing was sent: more credits mean a paid plan, which is the developer's call.`);
    this.name = 'QuotaExceeded';
    this.plan = plan;
  }
}

// The API key: ELEVENLABS_API_KEY, else the Keychain. Never logged.
export function apiKey(env = process.env) {
  if (env.ELEVENLABS_API_KEY) return env.ELEVENLABS_API_KEY;
  const r = spawnSync('security', ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-w'], { encoding: 'utf8' });
  if (r.status !== 0 || !r.stdout.trim()) throw new Error(`no ElevenLabs key: set ELEVENLABS_API_KEY or add the Keychain item "${KEYCHAIN_SERVICE}"`);
  return r.stdout.trim();
}

export function voiceState(env = process.env) {
  const f = env.VOICE_STATE || DEFAULT_VOICE_STATE;
  if (!existsSync(f)) throw new Error(`no voice state at ${f} (set VOICE_STATE to the kit's voice json)`);
  const v = JSON.parse(readFileSync(f, 'utf8'));
  if (!v.voice_id) throw new Error(`${f} has no voice_id`);
  return { voiceId: v.voice_id, model: v.model || MODEL };
}

// Spellings sent to the voice: the kit's shared lexicon (if present) and this
// repo's own (social/youtube/lexicon.json), with a beat's `lex` on top.
// Comment keys start with "//".
export function loadLexicon(env = process.env) {
  const read = (f) => (existsSync(f) ? Object.fromEntries(Object.entries(JSON.parse(readFileSync(f, 'utf8')).words || {}).filter(([k, v]) => !k.startsWith('//') && v)) : {});
  return { ...read(env.CATALYST_LEXICON || DEFAULT_LEXICON), ...read(join(YT_DIR, 'lexicon.json')) };
}

const AR = 'ء-ْـ';
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// -> { sent, spans: [[scriptStart, scriptEnd, sentStart, sentEnd]] }
export function applyLexicon(text, lex) {
  const keys = Object.keys(lex).sort((a, b) => b.length - a.length);
  if (!keys.length) return { sent: text, spans: [] };
  const re = new RegExp(keys.map((k) => `(?<![${AR}A-Za-z])${esc(k)}(?![${AR}A-Za-z])`).join('|'), 'g');
  let sent = '';
  let pos = 0;
  const spans = [];
  for (const m of text.matchAll(re)) {
    sent += text.slice(pos, m.index);
    const say = lex[m[0]];
    spans.push([m.index, m.index + m[0].length, sent.length, sent.length + say.length]);
    sent += say;
    pos = m.index + m[0].length;
  }
  return { sent: sent + text.slice(pos), spans };
}

// Timings of the sent text -> timings for every character of the script.
export function mapBack(text, spans, starts, ends) {
  const S = [], E = [];
  let k = 0, j = 0;
  for (const [a, b, c, d] of [...spans, [text.length, text.length, null, null]]) {
    while (k < a) { S.push(starts[j]); E.push(ends[j]); k++; j++; }
    if (c === null) break;
    const t0 = starts[c], t1 = ends[d - 1], n = b - a;
    for (let i = 0; i < n; i++) { S.push(t0 + ((t1 - t0) * i) / n); E.push(t0 + ((t1 - t0) * (i + 1)) / n); }
    k = b; j = d;
  }
  return { starts: S, ends: E };
}

// What a beat's take depends on: kept while this is unchanged.
export const takeKey = (sent, voiceId, model) => createHash('sha256').update(JSON.stringify([sent, voiceId, model, SETTINGS])).digest('hex').slice(0, 16);

export async function subscription(key, fetchImpl = fetch) {
  const r = await fetchImpl(`${API}/v1/user/subscription`, { headers: { 'xi-api-key': key } });
  if (!r.ok) throw new Error(`ElevenLabs subscription: HTTP ${r.status}`);
  const s = await r.json();
  return { used: s.character_count, limit: s.character_limit, tier: s.tier, resets: s.next_character_count_reset_unix ? new Date(s.next_character_count_reset_unix * 1000).toISOString().slice(0, 10) : '?' };
}

// Would `needed` characters fit the account, keeping `reserve` back?
export function quotaPlan(sub, needed, reserve = RESERVE) {
  const remaining = sub.limit - sub.used;
  return { needed, remaining, reserve, resets: sub.resets, ok: needed <= remaining - reserve, after: remaining - needed };
}

// One take with timestamps. Returns { audio: Buffer, starts, ends, requestId }.
export async function synthesize({ key, voiceId, model, text, previous, next, lang = 'ar', fetchImpl = fetch }) {
  const body = { text, model_id: model, language_code: lang, voice_settings: SETTINGS, ...(previous ? { previous_text: previous } : {}), ...(next ? { next_text: next } : {}) };
  for (let attempt = 1; ; attempt++) {
    const r = await fetchImpl(`${API}/v1/text-to-speech/${voiceId}/with-timestamps?output_format=${FORMAT}`, {
      method: 'POST', headers: { 'xi-api-key': key, 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    if (r.ok) {
      const j = await r.json();
      const al = j.alignment;
      const aligned = al && al.characters.join('') === text;
      return { audio: Buffer.from(j.audio_base64, 'base64'), starts: aligned ? al.character_start_times_seconds : null, ends: aligned ? al.character_end_times_seconds : null, requestId: r.headers.get('request-id') };
    }
    const detail = (await r.text()).slice(0, 300).replace(/xi-api-key[^,}]*/gi, '');
    if (r.status === 401 || r.status === 402 || /quota/i.test(detail)) throw new Error(`ElevenLabs refused the take (HTTP ${r.status}): ${detail}`);
    if (attempt >= 3 || r.status < 429) throw new Error(`ElevenLabs HTTP ${r.status}: ${detail}`);
    await new Promise((res) => setTimeout(res, 2000 * attempt));
  }
}
