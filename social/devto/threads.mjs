// Comment trees from GET /api/comments?a_id=<id>: flatten them and decide
// which comments still need a reply. Pure functions, no I/O.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const stripTags = (s) => s.replace(/<[^>]+>/g, '');

// Rendered comment HTML → readable text. Code blocks are kept as fenced code,
// links as "text (href)" unless the text already is the href or an @mention.
export function htmlToText(html) {
  let s = String(html || '');
  s = s.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, code) => `\n\`\`\`\n${stripTags(code).trim()}\n\`\`\`\n`);
  s = s.replace(/<a\s[^>]*?href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, inner) => {
    const text = stripTags(inner);
    if (!href || href.startsWith('#') || text.startsWith('@') || text.includes(href)) return text;
    return `${text} (${href})`;
  });
  s = s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6]|blockquote|ul|ol)>/gi, '\n').replace(/<li[^>]*>/gi, '- ');
  s = stripTags(s);
  s = s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] !== '#') return ENTITIES[e.toLowerCase()] ?? m;
    const cp = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    try { return String.fromCodePoint(cp); } catch { return m; }
  });
  return s.replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

const GONE = /^\[(deleted|hidden by (the )?post author|removed|hidden)\]$/i;

// One node per comment, depth-first in API order (each parent before its
// replies). ancestors: ids from the top-level comment down to the parent.
export function flattenTree(tree, { articleId = null } = {}) {
  const out = [];
  const walk = (nodes, parent, depth) => {
    for (const c of Array.isArray(nodes) ? nodes : []) {
      if (!c || typeof c.id_code !== 'string' || !c.id_code) continue;
      const text = htmlToText(c.body_html || '');
      const username = c.user?.username || null;
      const node = {
        id: c.id_code,
        articleId,
        parentId: parent ? parent.id : null,
        rootId: parent ? parent.rootId : c.id_code,
        ancestors: parent ? [...parent.ancestors, parent.id] : [],
        depth,
        author: username,
        name: c.user?.name || username,
        createdAt: c.created_at || null,
        text,
        deleted: !username || GONE.test(text),
        childIds: (Array.isArray(c.children) ? c.children : []).map((x) => x?.id_code).filter(Boolean),
      };
      out.push(node);
      walk(c.children, node, depth + 1);
    }
  };
  walk(tree, null, 0);
  return out;
}

const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

// Splits a flattened article into what to draft and what to skip:
//   seen      handled by an earlier run (state.seen) — never touched again
//   own       written by `me`
//   deleted   deleted/hidden, or the author's account is gone
//   answered  `me` already replied somewhere under it
//   toDraft   everything else, oldest first
export function classify(flat, { me, seen = {} } = {}) {
  const answered = new Set();
  for (const n of flat) if (same(n.author, me)) for (const a of n.ancestors) answered.add(a);
  const out = { toDraft: [], own: [], deleted: [], answered: [], seen: [] };
  for (const n of flat) {
    if (seen[n.id]) out.seen.push(n);
    else if (same(n.author, me)) out.own.push(n);
    else if (n.deleted) out.deleted.push(n);
    else if (answered.has(n.id)) out.answered.push(n);
    else out.toDraft.push(n);
  }
  out.toDraft.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  return out;
}

export const clip = (s, n) => {
  const t = String(s || '');
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};

// The comments above `node`, oldest first, for the drafter's context.
export function threadOf(node, flat, { maxChars = 700 } = {}) {
  const byId = new Map(flat.map((n) => [n.id, n]));
  return node.ancestors.map((id) => byId.get(id)).filter(Boolean).map((a) => ({ id: a.id, author: a.author, text: clip(a.deleted ? '[deleted]' : a.text, maxChars) }));
}

export const commentUrl = (node) => `https://dev.to/${node.author}/comment/${node.id}`;

// Letters and digits only, lowercased: compares a Markdown draft with the
// rendered comment text it became.
export const fingerprint = (s) => String(s || '').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, '');

// Does `text` (a rendered comment) carry `reply` (the approved Markdown)?
export function sameReply(text, reply) {
  const a = fingerprint(text);
  const b = fingerprint(String(reply || '').replace(/```[\w+-]*/g, '')).slice(0, 120);
  return b.length > 0 && a.includes(b);
}

// What `me` has under one comment: {node|null, mine: [nodes], match: node|null}.
export function repliesUnder(flat, commentId, me, reply = null) {
  const node = flat.find((n) => n.id === commentId) || null;
  const mine = flat.filter((n) => same(n.author, me) && n.ancestors.includes(commentId));
  const match = reply ? mine.find((n) => n.parentId === commentId && sameReply(n.text, reply)) || null : null;
  return { node, mine, match };
}
