#!/usr/bin/env node
// dev.to comment replies: draft, review, approve, and (by hand) post.
//
//   node devto.mjs scan [--dry-run] [--no-draft] [--max 30] [--all-articles]
//       Draft mode (what the daily routine runs). Reads the API key from the
//       Keychain, lists every article of DEVTO_USERNAME and its comment tree,
//       drafts replies to new comments and queues them. Never posts.
//       --dry-run: drafts to $DEVTO_HOME/dry/, queue and state untouched.
//       --no-draft: list new comments only (no model, nothing written).
//       --no-distill: skip the feedback loop's lessons update this run.
//   node devto.mjs discover [--dry-run] [--no-draft]
//       Discovery (the second daily routine): recent posts by others that match
//       his tags and searches (discovery.json); drafts a comment, and maybe a
//       reaction and a follow, for posts where a real comment adds value, into
//       the same queue, within the daily caps. Never posts.
//   node devto.mjs review [--all]           print the queue (and rewrite queue.md)
//   node devto.mjs approve <id> [<id> ...]  approve these exact drafts
//   node devto.mjs reject <id> [<id> ...]   reject drafts / dismiss flags
//   node devto.mjs edit <id> [--text "…"]   replace a draft ($EDITOR without --text); needs approval again
//   node devto.mjs status                   counts, last run, Keychain check
//   node devto.mjs feedback                 decisions not yet distilled + tracked posted replies
//   node devto.mjs lessons [<v>]            the lessons file the drafter reads (current or version v) and its history
//   node devto.mjs lessons rollback <v>     make version v current again (saved as a new version)
//   node devto.mjs post-plan                approved drafts that may be posted now, re-checked on dev.to (JSON)
//   node devto.mjs post-record < result     record the browser session's RESULT_JSON (verified on dev.to)
//   node devto.mjs post-reactions           post the approved reactions in the plan through the API
//
// Exit: 0 ok · 1 error · 2 usage · 5 NEEDS-YOU (API key missing, rejected or
// another account's) · 6 stopped on a usage limit (the rest is retried next run).

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { hostname, userInfo } from 'node:os';
import { ForemError, KEYCHAIN, createClient, createWriter, keychainCommand, readKeychainKey } from './forem.mjs';
import { discoverySummaryLine, loadConfig, runDiscovery, systemPrompt as discoverSystemPrompt } from './discover.mjs';
import { claudeDrafter, systemPrompt } from './drafts.mjs';
import { decisionEvents, distillSystemPrompt, lessonsLog, lessonsVersion, loadLessons, saveLessons } from './feedback.mjs';
import { approve, edit, postPlan, postReactions, recheck, recordPosted, reject } from './gate.mjs';
import { runScan, summaryLine } from './scan.mjs';
import { defaultHome, openStore } from './store.mjs';
import { renderQueue } from './view.mjs';

const USERNAME = process.env.DEVTO_USERNAME || KEYCHAIN.account;
const SERVICE = process.env.DEVTO_KEYCHAIN_SERVICE || KEYCHAIN.service;
const ACCOUNT = process.env.DEVTO_KEYCHAIN_ACCOUNT || USERNAME;
const NEEDS_YOU = 5;
const LIMITED = 6;

const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i > -1 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const ids = () => argv.slice(1).filter((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--text');
const who = () => `${userInfo().username}@${hostname().replace(/\.local$/, '')}`;

function needsYou(line) {
  console.log(`NEEDS-YOU: ${line}`);
  process.exit(NEEDS_YOU);
}

const missingKey = () => `no dev.to API key in the macOS Keychain (service "${SERVICE}", account "${ACCOUNT}"). Create one at https://dev.to/settings/extensions ("DEV Community API Keys"), then store it: ${keychainCommand({ service: SERVICE, account: ACCOUNT })}  (it prompts for the key). Nothing was read or drafted.`;

async function client() {
  const apiKey = readKeychainKey({ service: SERVICE, account: ACCOUNT });
  if (!apiKey) needsYou(missingKey());
  const c = createClient({ apiKey });
  let me;
  try {
    me = await c.me();
  } catch (e) {
    if (e instanceof ForemError && (e.status === 401 || e.status === 403)) needsYou(`dev.to rejected the API key in the Keychain (service "${SERVICE}", account "${ACCOUNT}", HTTP ${e.status}). Generate a new one at https://dev.to/settings/extensions and store it: ${keychainCommand({ service: SERVICE, account: ACCOUNT })}`);
    throw e;
  }
  if (String(me?.username || '').toLowerCase() !== USERNAME.toLowerCase()) needsYou(`the API key in the Keychain belongs to @${me?.username}, not @${USERNAME}. Store @${USERNAME}'s key: ${keychainCommand({ service: SERVICE, account: ACCOUNT })}`);
  return c;
}

const store = openStore(defaultHome());
const discoveryConfig = () => loadConfig(process.env.DEVTO_DISCOVERY_CONFIG || undefined);
const saveQueue = (q) => { store.saveQueue(q); store.writeText('queue.md', renderQueue(q)); };

async function main() {
  switch (cmd) {
    case 'scan': {
      const c = await client();
      const seat = process.env.DEVTO_SEAT || 'ceo';
      const { summary, listed } = await runScan({
        client: c, store, username: USERNAME,
        runModel: flag('--no-draft') ? null : claudeDrafter({ seat, system: () => systemPrompt({ lessons: loadLessons(store) }) }),
        distiller: flag('--no-draft') || flag('--no-distill') ? null : claudeDrafter({ seat, system: distillSystemPrompt(), done: /^--- END LESSONS ---$/m }),
        minEvents: Number(process.env.DEVTO_MIN_FEEDBACK || 3),
        drafter: `claude (${seat} seat)`,
        maxDrafts: Number(opt('--max', process.env.DEVTO_MAX_DRAFTS || 30)),
        dryRun: flag('--dry-run'), noDraft: flag('--no-draft'), allArticles: flag('--all-articles'),
      });
      if (flag('--no-draft')) for (const l of listed) console.log(`new · ${l.id} · @${l.author} · ${l.article} · ${l.url}\n    ${l.text.replace(/\s+/g, ' ')}`);
      console.log(summaryLine(summary));
      if (summary.dryFile) console.log(`dry-run drafts: ${summary.dryFile}`);
      console.log(`DEVTO_SUMMARY: ${JSON.stringify(summary)}`);
      if (summary.mode === 'draft' && summary.pending) console.log(`NEEDS-YOU: ${summary.pending} dev.to reply draft(s) waiting for review: devto review (queue: ${store.path('queue.md')})`);
      if (summary.limit) {
        console.log(`LIMIT: the drafting seat hit a ${summary.limit} usage limit; ${summary.deferred} comment(s) wait for the next run.`);
        process.exit(LIMITED);
      }
      return;
    }
    case 'discover': {
      const c = await client();
      const seat = process.env.DEVTO_SEAT || 'ceo';
      const { summary, listed } = await runDiscovery({
        client: c, store, username: USERNAME, config: discoveryConfig(),
        runModel: flag('--no-draft') ? null : claudeDrafter({ seat, system: discoverSystemPrompt(), done: /^DISCOVER_JSON:/m }),
        drafter: `claude (${seat} seat)`, dryRun: flag('--dry-run'), noDraft: flag('--no-draft'),
      });
      if (flag('--no-draft')) for (const l of listed) console.log(`candidate · ${l.score} · @${l.author} · ${l.title} · ${l.url} (${l.why})`);
      console.log(discoverySummaryLine(summary));
      if (summary.dryFile) console.log(`dry-run drafts: ${summary.dryFile}`);
      console.log(`DEVTO_DISCOVERY: ${JSON.stringify(summary)}`);
      if (summary.mode === 'discover' && summary.comments + summary.reactions + summary.follows) console.log(`NEEDS-YOU: ${summary.comments} comment(s), ${summary.reactions} reaction(s), ${summary.follows} follow(s) from discovery waiting for review: devto review`);
      if (summary.limit) process.exit(LIMITED);
      return;
    }
    case 'review': {
      const q = store.loadQueue();
      const text = renderQueue(q, { all: flag('--all') });
      store.writeText('queue.md', renderQueue(q));
      console.log(text);
      return;
    }
    case 'approve':
    case 'reject': {
      const list = ids();
      if (!list.length) { console.error(`usage: devto ${cmd} <id> [<id> ...]   (ids from: devto review)`); process.exit(2); }
      const q = store.loadQueue();
      const r = (cmd === 'approve' ? approve : reject)(q, list, { addDecision: store.addDecision, by: who() });
      saveQueue(q);
      if (r.done.length) console.log(`${cmd === 'approve' ? 'approved' : 'rejected'}: ${r.done.join(', ')}${cmd === 'approve' ? '  (post them with: devto post)' : ''}`);
      for (const e of r.errors) console.error(`not ${cmd}d: ${e}`);
      process.exit(r.errors.length ? 1 : 0);
    }
    case 'edit': {
      const id = ids()[0];
      if (!id) { console.error('usage: devto edit <id> [--text "new reply"]'); process.exit(2); }
      const q = store.loadQueue();
      const it = q.items.find((x) => x.id === id);
      if (!it) { console.error(`${id}: not in the queue`); process.exit(1); }
      let text = opt('--text', null);
      if (text === null) {
        const f = store.path(`edit-${id}.md`);
        store.writeText(`edit-${id}.md`, `${it.reply || ''}\n`);
        const editor = process.env.VISUAL || process.env.EDITOR || 'nano';
        const r = spawnSync('/bin/sh', ['-c', `${editor} "$1"`, 'sh', f], { stdio: 'inherit' });
        if (r.status !== 0) { console.error(`editor exited ${r.status}; nothing changed`); process.exit(1); }
        text = readFileSync(f, 'utf8');
      }
      const err = edit(q, id, text);
      if (err) { console.error(err); process.exit(1); }
      saveQueue(q);
      console.log(`${id}: draft replaced; it is pending again. Approve it with: devto approve ${id}`);
      return;
    }
    case 'status': {
      const q = store.loadQueue();
      const count = (st) => q.items.filter((x) => x.status === st).length;
      const key = readKeychainKey({ service: SERVICE, account: ACCOUNT }) ? 'present' : `MISSING (service "${SERVICE}", account "${ACCOUNT}")`;
      console.log(`dev.to @${USERNAME} · Keychain key: ${key} · home: ${store.dir}`);
      console.log(`queue: ${count('pending')} pending · ${count('approved')} approved · ${count('flagged')} flagged · ${count('posted')} posted · ${count('rejected')} rejected · ${count('stale')} stale`);
      const last = store.runs().at(-1);
      console.log(last ? `last run: ${summaryLine(last)} (${last.at})` : 'last run: none');
      console.log(`seen comments: ${Object.keys(store.loadState().seen).length}`);
      return;
    }
    case 'feedback': {
      const q = store.loadQueue();
      const since = store.loadState().feedback?.decisionsSince || '';
      const ev = decisionEvents(q, store.decisions(), { since });
      const tracked = Object.values(store.loadOutcomes());
      console.log(`${ev.length} decision(s) not yet distilled (since ${since || 'the start'}) · ${tracked.length} posted repl(y/ies) tracked · lessons v${loadLessons(store).version}`);
      for (const e of ev) console.log(`- ${e.type} ${e.id} (${e.at.slice(0, 10)})${e.diff ? `\n    ${e.diff}` : ''}`);
      for (const o of tracked) console.log(`- reply ${o.replyId} on ${o.commentId}: ${o.followUps} follow-up(s)${o.commenterAnswered ? ', commenter answered' : ''}`);
      return;
    }
    case 'lessons': {
      if (argv[1] === 'rollback') {
        const v = Number(argv[2]);
        const text = Number.isInteger(v) ? lessonsVersion(store, v) : null;
        if (!text) { console.error(`usage: devto lessons rollback <version>  (no version ${argv[2]})`); process.exit(2); }
        const nv = saveLessons(store, text, { note: `rollback to v${v}` });
        console.log(`lessons v${nv} = v${v} (rolled back); the next draft uses it`);
        return;
      }
      const cur = loadLessons(store);
      const v = argv[1] ? Number(argv[1]) : cur.version;
      const text = v === cur.version ? cur.text : lessonsVersion(store, v);
      if (!cur.version) { console.log('no lessons yet: they appear once enough feedback (approvals, edits, rejections, replies posted) has come in'); return; }
      if (text === null) { console.error(`no lessons version ${v}`); process.exit(1); }
      console.log(`# lessons v${v}${v === cur.version ? ' (current)' : ''}\n\n${text}\n\n## history`);
      for (const l of lessonsLog(store)) console.log(`v${l.version} · ${l.at.slice(0, 16)} · ${l.events} event(s) · ${l.note || ''}`);
      return;
    }
    case 'post-plan': {
      const q = store.loadQueue();
      const plan = postPlan(q, store.decisions(), store.posted(), { caps: discoveryConfig().caps });
      if (!plan.ready.length) { console.log(JSON.stringify({ ready: [], stale: [], found: [], blocked: plan.blocked })); return; }
      const c = await client();
      const checked = await recheck(c, plan, USERNAME);
      const at = new Date().toISOString();
      for (const st of checked.stale) {
        const it = q.items.find((x) => x.id === st.id);
        Object.assign(it, { status: 'stale', note: st.reason, updatedAt: at });
      }
      if (checked.found.length) {
        await recordPosted({ queue: q, decisions: store.decisions(), postedLedger: store.posted(), addPosted: store.addPosted, results: checked.found.map((f) => ({ id: f.id, status: 'found' })), client: c, me: USERNAME, at });
      }
      saveQueue(q);
      console.log(JSON.stringify(checked));
      return;
    }
    case 'post-reactions': {
      const q = store.loadQueue();
      const plan = postPlan(q, store.decisions(), store.posted(), { caps: discoveryConfig().caps });
      if (!plan.ready.some((p) => p.kind === 'reaction')) { console.log('no approved reactions to post'); return; }
      await client(); // checks the key belongs to the right account first
      const writer = createWriter({ apiKey: readKeychainKey({ service: SERVICE, account: ACCOUNT }) });
      const r = await postReactions({ plan, queue: q, writer, addPosted: store.addPosted });
      saveQueue(q);
      for (const p of r.posted) console.log(`reacted ${p.category} on article ${p.articleId} (${p.id})`);
      for (const f of r.failed) console.log(`failed ${f.id}: ${f.reason}`);
      process.exit(r.failed.length ? 3 : 0);
    }
    case 'post-record': {
      const raw = readFileSync(0, 'utf8').trim().replace(/^RESULT_JSON:\s*/, '');
      let results;
      try { results = JSON.parse(raw).results; } catch { console.error('post-record: stdin is not {"results":[...]}'); process.exit(1); }
      const q = store.loadQueue();
      const c = await client();
      const r = await recordPosted({ queue: q, decisions: store.decisions(), postedLedger: store.posted(), addPosted: store.addPosted, results, client: c, me: USERNAME });
      saveQueue(q);
      console.log(`posted ${r.posted.length} · stale ${r.stale.length} · failed ${r.failed.length} · unverified ${r.unverified.length} · ignored ${r.ignored.length}`);
      for (const p of r.posted) console.log(`posted ${p.id}: ${p.url}`);
      for (const k of ['stale', 'failed', 'unverified', 'ignored']) for (const x of r[k]) console.log(`${k} ${x.id}: ${x.reason}`);
      process.exit(r.failed.length || r.unverified.length ? 3 : 0);
    }
    default:
      console.error('usage: devto.mjs scan [--dry-run|--no-draft|--no-distill] | discover [--dry-run|--no-draft] | post-reactions | review [--all] | approve <ids> | reject <ids> | edit <id> [--text …] | status | feedback | lessons [<v>|rollback <v>] | post-plan | post-record < result');
      process.exit(2);
  }
}

main().catch((e) => {
  console.error(`ERROR: ${e instanceof ForemError ? e.message : e?.stack || e}`);
  process.exit(1);
});
