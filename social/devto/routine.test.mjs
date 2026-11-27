// The routine's wiring: the scheduled run is draft-only, the CLI's gate holds,
// a missing key stops with the exact Keychain names. node --test social/devto/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(join(HERE, f), 'utf8');
const cli = (args, env = {}, input) => spawnSync(process.execPath, [join(HERE, 'devto.mjs'), ...args], { encoding: 'utf8', input, env: { ...process.env, ...env } });
const fn = (src, name) => src.slice(src.indexOf(`${name}() {`), src.indexOf('\n}\n', src.indexOf(`${name}() {`)));

test('launchd runs the launcher with no argument (draft mode), daily at 08:30', () => {
  const plist = read('com.ahmedmahmoud.devya-devto-replies.plist');
  const args = plist.match(/<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/)[1];
  assert.deepEqual([...args.matchAll(/<string>([^<]*)<\/string>/g)].map((m) => m[1]), ['/bin/bash', '-lc', '__LAUNCHER__']);
  assert.match(plist, /<key>Hour<\/key><integer>8<\/integer><key>Minute<\/key><integer>30<\/integer>/);
  assert.match(plist, /<string>com\.ahmedmahmoud\.devya-devto-replies<\/string>/);
});

test('draft mode never posts: no plan, no Chrome, no post-record; posting needs the explicit "post" argument', () => {
  const sh = read('run-devto-replies.sh');
  assert.match(sh, /MODE="\$\{1:-draft\}"/);
  const draft = fn(sh, 'draft_run');
  assert.equal(draft.trim(), 'draft_run() {\n  $DEVTO scan');
  const post = fn(sh, 'post_run');
  assert.match(post, /\$DEVTO post-plan/);
  assert.match(post, /--chrome/);
  assert.equal(sh.split('--chrome').length, 2, '--chrome appears only in post_run');
  assert.ok(!sh.replace(post, '').includes('$DEVTO post-'), 'post-plan/post-record run only inside post_run');
  assert.match(sh, /if \[\[ "\$MODE" == "post" \]\]; then post_run; RC=\$\?; else draft_run; RC=\$\?; fi/);
});

test('the drafting session has no tools and the poster only Chrome tools', () => {
  const drafts = read('drafts.mjs');
  assert.match(drafts, /'--print', '--tools', '', '--strict-mcp-config'/);
  const sh = read('run-devto-replies.sh');
  const tools = sh.match(/local TOOLS="([^"]+)"/)[1].split(' ');
  assert.ok(tools.length > 5);
  for (const t of tools) assert.match(t, /^mcp__claude-in-chrome__/);
  assert.ok(!tools.includes('mcp__claude-in-chrome__javascript_tool'));
});

test('shell scripts parse', () => {
  for (const f of ['run-devto-replies.sh', 'ctl.sh']) {
    const r = spawnSync('/bin/bash', ['-n', join(HERE, f)], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${f}: ${r.stderr}`);
  }
});

test('CLI: a missing Keychain key stops the scan with the exact service and account to use', () => {
  const home = mkdtempSync(join(tmpdir(), 'devto-cli-'));
  try {
    const r = cli(['scan'], { DEVTO_HOME: home, DEVTO_KEYCHAIN_SERVICE: `devto-api-key-missing-${process.pid}` });
    assert.equal(r.status, 5);
    assert.match(r.stdout, /^NEEDS-YOU: no dev\.to API key in the macOS Keychain \(service "devto-api-key-missing-\d+", account "ahmed_mahmoud360"\)/);
    assert.match(r.stdout, /security add-generic-password -U -s devto-api-key-missing-\d+ -a ahmed_mahmoud360 -w/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('CLI: forged approvals plan nothing; approve → post-plan offers exactly the approved text', () => {
  const home = mkdtempSync(join(tmpdir(), 'devto-cli-'));
  try {
    const item = (id, status) => ({ id, commentId: id, articleId: 1, articleTitle: 'A', commentUrl: `https://dev.to/s/comment/${id}`, author: 's', kind: 'reply', reply: `Reply ${id}.`, status });
    writeFileSync(join(home, 'queue.json'), JSON.stringify({ version: 1, items: [item('k1', 'pending'), item('k2', 'approved'), { id: 'f1', commentId: 'f1', kind: 'flag', reason: 'spam: x', status: 'flagged' }] }));
    const env = { DEVTO_HOME: home, DEVTO_KEYCHAIN_SERVICE: `devto-api-key-missing-${process.pid}` };
    const before = cli(['post-plan'], env);
    assert.equal(before.status, 0, before.stderr);
    const p0 = JSON.parse(before.stdout);
    assert.deepEqual(p0.ready, []);
    assert.deepEqual(p0.blocked, [{ id: 'k2', reason: 'no approval record' }]);

    const flagged = cli(['approve', 'f1'], env);
    assert.equal(flagged.status, 1);
    assert.match(flagged.stderr, /flagged comment, nothing to approve/);

    const ok = cli(['approve', 'k1'], env);
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /approved: k1/);
    const rec = readFileSync(join(home, 'decisions.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(rec.length, 1);
    assert.equal(rec[0].decision, 'approve');
    assert.match(rec[0].sha256, /^[0-9a-f]{64}$/);

    // With an approved draft, post-plan must re-check dev.to, which needs the key: it stops instead of planning blind.
    const after = cli(['post-plan'], env);
    assert.equal(after.status, 5);
    assert.match(after.stdout, /^NEEDS-YOU: no dev\.to API key/);

    const edited = cli(['edit', 'k1', '--text', 'Reply k1, edited.'], env);
    assert.equal(edited.status, 0, edited.stderr);
    const replan = JSON.parse(cli(['post-plan'], env).stdout);
    assert.deepEqual(replan.ready, []);
    assert.deepEqual(replan.blocked.map((b) => b.id).sort(), ['k2']);
    assert.match(readFileSync(join(home, 'queue.md'), 'utf8'), /Reply k1, edited\./);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('CLI: review prints the queue with ids and the commands to act on them', () => {
  const home = mkdtempSync(join(tmpdir(), 'devto-cli-'));
  try {
    writeFileSync(join(home, 'queue.json'), JSON.stringify({ version: 1, items: [{ id: 'k9', commentId: 'k9', articleTitle: 'Testing Node', commentUrl: 'https://dev.to/sam/comment/k9', author: 'sam', comment: 'How?', kind: 'reply', lang: 'en', reply: 'Like this.', status: 'pending', thread: [] }] }));
    const r = cli(['review'], { DEVTO_HOME: home });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /1 pending/);
    assert.match(r.stdout, /### `k9` · Testing Node/);
    assert.match(r.stdout, /> How\?/);
    assert.match(r.stdout, /Like this\./);
    assert.match(r.stdout, /devto approve <id>/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('no code path logs or prompts the API key', () => {
  for (const f of ['devto.mjs', 'scan.mjs', 'drafts.mjs', 'gate.mjs']) {
    const src = read(f);
    assert.ok(!/console\.(log|error)\([^)]*apiKey/.test(src), f);
    assert.ok(!/prompt[^\n]*apiKey|apiKey[^\n]*prompt/i.test(src), f);
  }
  assert.ok(!read('run-devto-replies.sh').includes('find-generic-password'), 'the shell never reads the key');
});
