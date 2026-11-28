// Files of the dev.to replies routine. They live outside the repo (the repo is
// public, and unapproved drafts and flagged comments stay private), in
// $DEVTO_HOME, default ~/.config/devya-social/devto/:
//
//   state.json       seen comment ids and why (drafted, own, answered, ...)
//   queue.json       the review queue: drafts and flags with their status
//   queue.md         readable copy of the queue, rewritten on every change
//   decisions.jsonl  append-only approve/reject records (id, sha256 of the
//                    exact approved text, time, who): the approval gate
//   posted.jsonl     append-only ledger of posted replies (never twice)
//   runs.jsonl       one summary per run
//   outcomes.json    what happened under each posted reply (feedback loop)
//   lessons.md, lessons/  the versioned lessons file the drafter reads (feedback.mjs)
//   dry/             drafts of --dry-run runs (never queued)

import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const defaultHome = () => process.env.DEVTO_HOME || join(homedir(), '.config', 'devya-social', 'devto');

export function openStore(dir = defaultHome()) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const p = (f) => join(dir, f);
  const readJson = (f, d) => (existsSync(p(f)) ? JSON.parse(readFileSync(p(f), 'utf8')) : d);
  const writeJson = (f, v) => {
    const tmp = `${p(f)}.tmp-${process.pid}`;
    writeFileSync(tmp, `${JSON.stringify(v, null, 2)}\n`, { mode: 0o600 });
    renameSync(tmp, p(f));
  };
  const readLines = (f) => (existsSync(p(f)) ? readFileSync(p(f), 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)) : []);
  const append = (f, v) => appendFileSync(p(f), `${JSON.stringify(v)}\n`, { mode: 0o600 });
  return {
    dir,
    path: p,
    loadState: () => ({ version: 1, seen: {}, failures: {}, ...readJson('state.json', {}) }),
    saveState: (s) => writeJson('state.json', s),
    loadQueue: () => ({ version: 1, items: [], ...readJson('queue.json', {}) }),
    saveQueue: (q) => writeJson('queue.json', q),
    decisions: () => readLines('decisions.jsonl'),
    addDecision: (r) => append('decisions.jsonl', r),
    posted: () => readLines('posted.jsonl'),
    addPosted: (r) => append('posted.jsonl', r),
    runs: () => readLines('runs.jsonl'),
    addRun: (r) => append('runs.jsonl', r),
    appendLine: (f, v) => {
      mkdirSync(join(p(f), '..'), { recursive: true, mode: 0o700 });
      append(f, v);
    },
    loadOutcomes: () => readJson('outcomes.json', {}),
    saveOutcomes: (o) => writeJson('outcomes.json', o),
    writeText: (f, s) => {
      mkdirSync(join(p(f), '..'), { recursive: true, mode: 0o700 });
      writeFileSync(p(f), s, { mode: 0o600 });
    },
  };
}

// Records comments as handled so no later run looks at them again.
export function markSeen(state, nodes, outcome, at) {
  for (const n of nodes) {
    if (state.seen[n.id]) continue;
    state.seen[n.id] = { article: n.articleId, outcome, at };
    delete state.failures?.[n.id];
  }
}

// Adds a queue item unless the comment already has one. Returns true if added.
export function enqueue(queue, item) {
  if (queue.items.some((x) => x.commentId === item.commentId)) return false;
  queue.items.push(item);
  return true;
}
