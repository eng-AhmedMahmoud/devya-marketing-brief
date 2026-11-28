// Readable view of the review queue: printed by `devto review` and written to
// queue.md after every change. Markdown that also reads well in a terminal.

const quote = (s, n = 600) => {
  const t = String(s || '');
  const c = t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
  return c.split('\n').map((l) => `> ${l}`).join('\n');
};
const day = (iso) => String(iso || '').slice(0, 10);

function discoveryCard(it) {
  const on = `“${it.articleTitle}” by @${it.author} · ${it.articleUrl}${it.why ? `\nfound by: ${it.why}` : ''}`;
  const extra = [it.postedUrl ? `posted: ${it.postedUrl}` : '', it.note ? `note: ${it.note}` : ''].filter(Boolean).join(' · ');
  if (it.kind === 'reaction') return `### \`${it.id}\` · reaction **${it.category}** on ${on}${extra ? `\n${extra}` : ''}\n`;
  if (it.kind === 'follow') return `### \`${it.id}\` · follow **@${it.username}** · https://dev.to/${it.username}\n${it.reason || ''}${extra ? `\n${extra}` : ''}\n`;
  return `### \`${it.id}\` · comment on ${on}\n\n**Comment${it.lang ? ` (${it.lang})` : ''}${it.edited ? ' · edited' : ''}${extra ? ` · ${extra}` : ''}:**\n\n${it.reply}\n`;
}

function card(it) {
  if (it.source === 'discovery') return discoveryCard(it);
  const above = it.thread?.length ? `\n> ↳ in reply to @${it.thread.at(-1).author}: “${String(it.thread.at(-1).text).replace(/\s+/g, ' ').slice(0, 160)}”\n>` : '';
  const head = `### \`${it.id}\` · ${it.articleTitle}\n@${it.author}${it.authorName && it.authorName !== it.author ? ` (${it.authorName})` : ''} · ${day(it.commentAt)} · ${it.commentUrl}\n${above}\n${quote(it.comment)}\n`;
  if (it.kind === 'flag') return `${head}\n**Flagged, no draft:** ${it.reason}\n`;
  const extra = [it.edited ? 'edited' : '', it.postedUrl ? `posted: ${it.postedUrl}` : '', it.note ? `note: ${it.note}` : ''].filter(Boolean).join(' · ');
  return `${head}\n**Draft${it.lang ? ` (${it.lang})` : ''}${extra ? ` · ${extra}` : ''}:**\n\n${it.reply}\n`;
}

export function renderQueue(queue, { all = false, title = 'dev.to reply queue', now = new Date() } = {}) {
  const items = queue.items || [];
  const by = (st) => items.filter((x) => x.status === st);
  const pending = by('pending');
  const approved = by('approved');
  const flagged = by('flagged');
  const done = items.filter((x) => !['pending', 'approved', 'flagged'].includes(x.status));
  const out = [
    `# ${title}`,
    '',
    `${pending.length} pending · ${approved.length} approved, not posted · ${flagged.length} flagged · ${done.length} done · updated ${now.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    '',
    'Approve: `devto approve <id> [<id> ...]` · Reject: `devto reject <id>` · Edit: `devto edit <id>` · Post the approved ones: `devto post`',
    '',
  ];
  const section = (name, list) => {
    if (!list.length) return;
    out.push(`## ${name}`, '');
    for (const it of list) out.push(card(it), '---', '');
  };
  section('Pending review', pending);
  section('Approved, not posted yet', approved);
  section('Flagged (no draft: spam, abuse or undraftable)', flagged);
  if (all) section('Done (posted, rejected, dismissed, stale)', done);
  if (!pending.length && !approved.length && !flagged.length) out.push('Nothing to review.', '');
  return `${out.join('\n').trimEnd()}\n`;
}
