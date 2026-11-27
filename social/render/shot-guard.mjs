// Guards the product layout's live screenshot (card.shot). A shot is refused,
// never recorded, when:
//   - its URL (or where it redirects) is on Vercel: Vercel is banned for
//     everything Devya ships since 2026-11-27, after a paused urania.vercel.app
//     deployment went out in that day's reels as a black "paused" screen;
//   - the page answers with an HTTP error;
//   - the page shows a paused, suspended or error page, or next to no text.
// A refusal throws ShotRefused; render.mjs and render-reel.mjs exit with
// SHOT_REFUSED_EXIT so the routine holds whatever would have shown the shot.

export const SHOT_REFUSED_EXIT = 4;

export class ShotRefused extends Error {
  constructor(url, reason) {
    super(`shot refused for ${url}: ${reason}`);
    this.name = 'ShotRefused';
    this.url = url;
    this.reason = reason;
  }
}

// vercel.app (deployments) and now.sh (Vercel's old deployment domain).
const BANNED_HOST = /(^|\.)(vercel\.app|now\.sh)$/i;

export const isBannedHost = (host = '') => BANNED_HOST.test(String(host).replace(/\.$/, ''));

// Returns why a URL can't be used as a shot, or null when it can.
export function shotUrlProblem(url) {
  let u;
  try { u = new URL(url); } catch { return 'not a valid URL'; }
  if (u.protocol !== 'https:') return 'not an https URL';
  if (isBannedHost(u.hostname)) return `${u.hostname} is a Vercel host (Vercel is banned); use the app's own devya.dev host`;
  return null;
}

// Phrases that mean the page is a host's paused/outage/error page, not the product.
const BAD_PAGE = [
  /\bdeployment (is|has been) (temporarily )?(paused|disabled|suspended|blocked)\b/i,
  /\b(site|website|project|app|account|service) (is|has been) (temporarily )?(paused|suspended|disabled)\b/i,
  /\bDEPLOYMENT_(PAUSED|NOT_FOUND|DISABLED|BLOCKED|DELETED)\b/,
  /\b(404|NOT_FOUND)\b[^\n]{0,40}\b(not found|NOT_FOUND|page)\b/i,
  /\bpage (could not|cannot|can't|couldn't) be found\b|\bpage not found\b/i,
  /\bapplication error\b|\binternal server error\b|\bbad gateway\b|\bservice (temporarily )?unavailable\b|\bgateway time-?out\b/i,
  /\bthis site can.?t be reached\b|\bweb server is down\b|\borigin (dns )?error\b|\berror code:? ?(5\d\d|1\d{3})\b/i,
];
const MIN_TEXT = 40;

// Returns why the page's visible text looks like an error/paused page, or null.
export function pageTextProblem(text = '') {
  const t = String(text).replace(/\s+/g, ' ').trim();
  for (const re of BAD_PAGE) {
    const m = t.match(re);
    if (m) return `page shows "${m[0]}"`;
  }
  if (t.length < MIN_TEXT) return `page shows almost no text (${t.length} chars): blank, paused or still loading`;
  return null;
}
