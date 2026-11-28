// Test fixtures for social/devto/*.test.mjs: a fake dev.to API (mocked HTTP)
// and comment builders. Not used at run time.

export const ME = 'ahmed_mahmoud360';
export const KEY = 'fake-devto-key';

let n = 0;
export function comment(user, html, children = [], extra = {}) {
  n++;
  return {
    type_of: 'comment',
    id_code: extra.id || `c${n.toString(36)}`,
    created_at: extra.at || `2026-11-${String(10 + (n % 18)).padStart(2, '0')}T10:00:00Z`,
    body_html: html.startsWith('<') ? html : `<p>${html}</p>`,
    user: user ? { username: user, name: extra.name || user } : null,
    children,
  };
}

export function article(id, extra = {}) {
  return { type_of: 'article', id, title: `Article ${id}`, url: `https://dev.to/${ME}/article-${id}`, comments_count: 1, tag_list: ['node'], published_at: '2026-10-01T00:00:00Z', ...extra };
}

const respond = (body, status = 200, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers(headers),
  json: async () => body,
});

const page = (rows, u) => {
  const p = Number(u.searchParams.get('page') || 1);
  const per = Number(u.searchParams.get('per_page') || 30);
  return rows.slice((p - 1) * per, p * per);
};

// articles: [article]; comments: {articleId: tree}; bodies: {articleId: md}
// script: optional [{match: RegExp, status, headers, times}] answered first.
// pool: other people's articles, served by ?tag= and /articles/search.
// writes: an array to record POST /api/reactions in (otherwise writes get 405).
export function fakeDevto({ articles = [], comments = {}, bodies = {}, me = ME, key = KEY, script = [], pool = [], writes = null } = {}) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const u = new URL(url);
    calls.push({ url: u, init });
    for (const s of script) {
      if (s.times > 0 && s.match.test(u.pathname + u.search)) { s.times--; return respond({ error: 'scripted' }, s.status, s.headers || {}); }
    }
    if (init.headers?.['api-key'] !== key) return respond({ error: 'unauthorized' }, 401);
    if (init.method && init.method !== 'GET') {
      if (writes && init.method === 'POST' && u.pathname === '/api/reactions') {
        writes.push({ category: u.searchParams.get('category'), id: Number(u.searchParams.get('reactable_id')), type: u.searchParams.get('reactable_type') });
        return respond({ result: 'create', category: u.searchParams.get('category') });
      }
      return respond({ error: 'read-only fake' }, 405);
    }
    if (u.pathname === '/api/articles' && u.searchParams.get('tag')) return respond(pool.filter((a) => (a.tag_list || []).includes(u.searchParams.get('tag'))));
    if (u.pathname === '/api/articles/search') return respond(pool.filter((a) => a.title.toLowerCase().includes(String(u.searchParams.get('q')).toLowerCase())));
    if (u.pathname === '/api/users/me') return respond({ username: me, name: 'Ahmed Mahmoud' });
    if (u.pathname === '/api/articles') return respond(page(u.searchParams.get('username') === me ? articles : [], u));
    if (u.pathname === '/api/comments') return respond(page(comments[u.searchParams.get('a_id')] || [], u));
    const m = u.pathname.match(/^\/api\/articles\/(\d+)$/);
    if (m) {
      const a = [...articles, ...pool].find((x) => String(x.id) === m[1]);
      return a ? respond({ ...a, body_markdown: bodies[m[1]] || `# ${a.title}\n\nUse \`node --test\` and run it twice.` }) : respond({ error: 'not found' }, 404);
    }
    return respond({ error: 'not found' }, 404);
  };
  return { fetch, calls };
}

export const noSleep = async () => {};

// A drafter that answers every comment in the prompt with `reply(id)`, or
// whatever `plan(ids, prompt, call)` returns as the DRAFTS_JSON payload.
export function fakeModel(plan) {
  const prompts = [];
  const run = async (prompt) => {
    prompts.push(prompt);
    const ids = (prompt.match(/one entry for each of these ids: (.+)\.$/m)?.[1] || '').split(', ').filter(Boolean);
    const out = plan ? plan(ids, prompt, prompts.length) : { drafts: ids.map((id) => ({ id, action: 'reply', lang: 'en', reply: `Thanks, running \`node --test\` twice covers it (${id}).` })) };
    if (out && out.limit) return { out: out.text || '', limit: out.limit };
    return { out: `drafting...\nDRAFTS_JSON: ${JSON.stringify(out)}` };
  };
  run.prompts = prompts;
  return run;
}
