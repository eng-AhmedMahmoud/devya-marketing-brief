// Read-only Forem (dev.to) API v1 client for the dev.to replies routine.
// Runs in node, never in a model session: the API key is read from the macOS
// Keychain here and only ever travels in the `api-key` request header. It is
// never logged, never put in an error message and never passed to a prompt.
//
// The Forem API v1 can list articles and comment trees but has no endpoint to
// create a comment (only GET /comments, GET /comments/{id}, POST
// /comments/preview), so posting an approved reply is a browser step
// (post-worker.md), never this client.

import { spawnSync } from 'node:child_process';

export const API = 'https://dev.to/api';
export const ACCEPT = 'application/vnd.forem.api-v1+json';
// dev.to answers a bare 403 to requests without a User-Agent.
export const UA = 'devya-devto-replies/1.0 (+https://devya.dev)';
export const KEYCHAIN = { service: 'devto-api-key', account: 'ahmed_mahmoud360' };

export class ForemError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'ForemError';
    this.status = status;
  }
}

// The key from the login Keychain, or null when there is no such item.
// `run` is injectable for tests (same signature as spawnSync).
export function readKeychainKey({ service = KEYCHAIN.service, account = KEYCHAIN.account, run = spawnSync } = {}) {
  const r = run('/usr/bin/security', ['find-generic-password', '-s', service, '-a', account, '-w'], { encoding: 'utf8', timeout: 15_000 });
  if (!r || r.error || r.status !== 0) return null;
  const key = String(r.stdout || '').trim();
  return key || null;
}

// The exact command the developer runs to store the key (it prompts for it, so
// the key never lands in shell history).
export function keychainCommand({ service = KEYCHAIN.service, account = KEYCHAIN.account } = {}) {
  return `security add-generic-password -U -s ${service} -a ${account} -w`;
}

const dedupe = (rows, key) => {
  const seen = new Set();
  return rows.filter((r) => {
    const k = key(r);
    if (k === undefined || k === null || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

export function createClient({
  apiKey,
  fetch = globalThis.fetch,
  base = API,
  perPage = 100,
  maxPages = 200,
  maxTries = 4,
  minIntervalMs = 350,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
} = {}) {
  if (!apiKey) throw new ForemError('no dev.to API key');
  let last = 0;

  async function getJson(path, params = {}) {
    const url = new URL(base + path);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    const where = `GET ${url.pathname}${url.search}`;
    for (let attempt = 1; ; attempt++) {
      const wait = last + minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      last = Date.now();
      let res;
      try {
        res = await fetch(url, { headers: { accept: ACCEPT, 'api-key': apiKey, 'user-agent': UA } });
      } catch (e) {
        if (attempt < maxTries) { await sleep(1000 * attempt); continue; }
        throw new ForemError(`${where}: network error (${e?.cause?.code || e?.code || 'fetch failed'})`);
      }
      if ((res.status === 429 || res.status >= 500) && attempt < maxTries) {
        const ra = Number(res.headers?.get?.('retry-after'));
        await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 60) * 1000 : 2000 * attempt);
        continue;
      }
      if (!res.ok) throw new ForemError(`${where}: HTTP ${res.status}`, res.status);
      try {
        return await res.json();
      } catch {
        throw new ForemError(`${where}: response is not JSON`, res.status);
      }
    }
  }

  // Pages until a page comes back shorter than per_page. On /comments, `page`
  // pages the top-level comments; each comes with its whole reply tree.
  async function paginate(path, params) {
    const out = [];
    for (let page = 1; page <= maxPages; page++) {
      const rows = await getJson(path, { ...params, page, per_page: perPage });
      if (!Array.isArray(rows)) throw new ForemError(`GET ${path}: expected an array`);
      out.push(...rows);
      if (rows.length < perPage) return out;
    }
    throw new ForemError(`GET ${path}: more than ${maxPages} pages`);
  }

  return {
    me: () => getJson('/users/me'),
    listArticles: async (username) => dedupe(await paginate('/articles', { username }), (a) => a?.id),
    listComments: async (articleId) => dedupe(await paginate('/comments', { a_id: articleId }), (c) => c?.id_code),
    getArticle: (id) => getJson(`/articles/${encodeURIComponent(id)}`),
  };
}
