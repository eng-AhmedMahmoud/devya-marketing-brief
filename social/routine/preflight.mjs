#!/usr/bin/env node
// Preflight checks for the daily social routine. Deterministic, no model calls.
//
//   node preflight.mjs browser --seat ceo [--tries 2] [--wait 30]
//       Is the seat's Chrome (Claude in Chrome) connected? Asks brain
//       (`brain chrome check <seat> --no-pages --json`), retries once after a
//       short wait (an idle extension can miss the first call), and prints one
//       JSON line: {"ok":bool,"unknown":bool,"deviceId":string|null,"line":string}.
//       Exit 0: connected, or the check itself could not run (fail open: the
//       publish session still reports a missing browser). Exit 3: not connected;
//       `line` is the NEEDS-YOU line naming the fix.
//
//   node preflight.mjs limit < claude-output
//       Did a claude session stop on a usage-limit banner? Prints
//       {"limit":null} or {"limit":"model"|"seat","banner":"…"}.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CIC_EXTENSION = 'fcoeoabgfenejglbffodgkkbkcdhcgfn';
export const NEEDS_YOU = 3;
const RETRY = 'Nothing was posted; the next slot retries.';

// Problem kinds from brain's Chrome check that mean the session would find no
// usable browser. "pair" (paired with another device while several are listed)
// is not one: the launcher passes the right deviceId to the session instead.
const BLOCKING = new Set(['no-profile', 'no-extension', 'not-connected', 'other-profile']);
const blocks = (p) => (BLOCKING.has(p?.kind) && p?.key !== 'pair') || (p?.kind === 'login-expired' && p?.key === 'login:claude');

// checks: the array `brain chrome check <seat> --json` prints.
// holder: the email of another account whose Claude-in-Chrome device lives in
//   the seat's Chrome profile (the extension there is signed in to the wrong account).
// chromeRunning: false when no Chrome process is running at all.
export function browserVerdict(checks, { seat, holder = null, chromeRunning = true } = {}) {
  const c = Array.isArray(checks) ? checks.find((x) => x && x.seat === seat) : null;
  if (!c) {
    return { ok: false, unknown: true, deviceId: null, line: `WARN: browser preflight could not read brain's Chrome check for ${seat}; going ahead (the publish session reports a missing browser itself)` };
  }
  const problems = Array.isArray(c.problems) ? c.problems : [];
  const blocking = problems.filter(blocks);
  const deviceId = c.device?.id || null;
  if (deviceId && !blocking.length) {
    return { ok: true, unknown: false, deviceId, line: `browser preflight: ok · ${c.profile || seat} · connected as ${c.email} (device ${deviceId.slice(0, 8)})` };
  }
  if (!blocking.length) {
    // No device and no connection problem: brain hit an error of its own.
    const why = problems.map((p) => p.text).filter(Boolean).join('; ') || 'no device and no reason given';
    return { ok: false, unknown: true, deviceId: null, line: `WARN: browser preflight inconclusive for ${seat} (${why}); going ahead` };
  }
  const where = c.profile || `the ${seat} seat's Chrome profile`;
  const email = c.email || `the ${seat} account`;
  let fix;
  if (!chromeRunning) {
    fix = `Chrome is not running. Open ${where} and leave it open (brain chrome open ${seat}).`;
  } else if (holder && holder.toLowerCase() !== String(c.email || '').toLowerCase()) {
    fix = `the Claude extension in ${where} is signed in as ${holder}, not ${email}. In that window open the Claude extension, log out, and log in as ${email} (switch claude.ai in that profile to ${email} first if it is on another account).`;
  } else {
    fix = `${String(blocking[0].text || 'the browser is not connected').replace(/^[\w-]+:\s*/, '')}.`;
  }
  return { ok: false, unknown: false, deviceId: null, line: `NEEDS-YOU: ${fix} ${RETRY}` };
}

// Which account's Claude-in-Chrome device is stored in this extension storage
// dir. accounts: [{email, deviceId}]. Returns the seat's own email when its
// device is there, another account's email when only that one's is, else null.
// Searches the storage files for each exact id; nothing is read out.
export function deviceHolder(extDir, accounts, seatEmail) {
  let files = [];
  try {
    files = readdirSync(extDir).filter((f) => /\.(log|ldb)$/.test(f));
  } catch {
    return null;
  }
  const ids = accounts.filter((a) => a && a.deviceId && a.email);
  const found = new Set();
  for (const f of files) {
    try {
      const file = join(extDir, f);
      if (statSync(file).size > 64 * 1024 * 1024) continue;
      const buf = readFileSync(file);
      for (const a of ids) if (buf.includes(a.deviceId)) found.add(a.email.toLowerCase());
    } catch { /* rotated away under us */ }
  }
  const seat = String(seatEmail || '').toLowerCase();
  if (found.has(seat)) return seat;
  return [...found][0] || null;
}

// A usage-limit banner in a claude session's output. "model": only that model
// is capped (another model can run now); "seat": the account itself is capped.
export function limitBanner(text) {
  const s = String(text || '');
  const m = s.match(/^.*You've hit your ([^\n·]*?) ?limit\b[^\n]*$/m);
  if (m) {
    const name = m[1].trim().toLowerCase();
    const model = /switch to another model/i.test(m[0]) || /\b(fable|opus|sonnet|haiku)\b/.test(name);
    return { limit: model ? 'model' : 'seat', banner: m[0].trim() };
  }
  const u = s.match(/^.*usage limit reached\|\d+.*$/m);
  if (u) return { limit: 'seat', banner: u[0].trim() };
  return { limit: null };
}

// Runs `check` up to `tries` times, `waitMs` apart, until it is ok or unknown.
export async function withRetry(check, { tries = 2, waitMs = 30_000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let v;
  for (let i = 1; i <= Math.max(1, tries); i++) {
    v = await check();
    if (v.ok || v.unknown) return v;
    if (i < tries) await sleep(waitMs);
  }
  return v;
}

// ---------- reading this Mac (CLI only) ----------

const BRAIN_HOME = process.env.BRAIN_HOME || join(homedir(), '.claude-brain');
const readJson = (f, d) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return d; } };

function brainCheck(seat) {
  const brain = [join(homedir(), 'bin', 'brain'), '/opt/homebrew/bin/brain', '/usr/local/bin/brain'].find((p) => existsSync(p)) || 'brain';
  const r = spawnSync(brain, ['chrome', 'check', seat, '--no-pages', '--json'], { encoding: 'utf8', timeout: 90_000 });
  try { return JSON.parse(r.stdout); } catch { return null; }
}

function chromeRunning() {
  const r = spawnSync('/usr/bin/pgrep', ['-f', 'Contents/MacOS/Google Chrome( |$)'], { encoding: 'utf8' });
  if (r.error) return true; // cannot tell: don't claim it is closed
  return r.status === 0;
}

function holderFor(seat) {
  const cfg = readJson(join(BRAIN_HOME, 'config.json'), {});
  const accounts = Array.isArray(cfg.accounts) ? cfg.accounts : [];
  const me = accounts.find((a) => a.name === seat);
  if (!me?.chrome?.profile) return null;
  const dataDir = me.chrome.userDataDir || join(homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
  const devices = accounts.map((a) => {
    const j = readJson(a.configDir ? join(a.configDir, '.claude.json') : join(homedir(), '.claude.json'), {});
    return { email: j.oauthAccount?.emailAddress || a.email, deviceId: j.chromeExtension?.pairedDeviceId };
  });
  return deviceHolder(join(dataDir, me.chrome.profile, 'Local Extension Settings', CIC_EXTENSION), devices, me.email);
}

function arg(name, d) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d;
}

async function main() {
  const cmd = process.argv[2];
  if (cmd === 'browser') {
    const seat = arg('seat', 'ceo');
    const v = await withRetry(
      async () => browserVerdict(brainCheck(seat), { seat, holder: holderFor(seat), chromeRunning: chromeRunning() }),
      { tries: Number(arg('tries', 2)), waitMs: Number(arg('wait', 30)) * 1000 },
    );
    console.log(JSON.stringify(v));
    process.exit(v.ok || v.unknown ? 0 : NEEDS_YOU);
  } else if (cmd === 'limit') {
    console.log(JSON.stringify(limitBanner(readFileSync(0, 'utf8'))));
  } else {
    console.error('usage: preflight.mjs browser --seat <seat> [--tries N] [--wait S] | limit < output');
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
