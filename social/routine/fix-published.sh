#!/usr/bin/env bash
# Applies the newest audit's in-place fixes to Devya posts that are already
# live: caption edits (links tagged, hashtags) and Facebook Reel video swaps
# (music bed, official logo, black and silver theme). Run it by hand, once, on
# the ceo seat (its Chrome "Profile 2" holds the Devya accounts); launchd never
# runs it. It never deletes or reposts anything.
#
#   social/routine/fix-published.sh [--only facebook_reel,linkedin] [--dry-run]
#
# Steps: refresh the audit and the replacement media (render/audit.mjs --render),
# list the in-place items (fix-published.mjs), run a Chrome-only Claude session
# with fix-published-worker.md, then record each live result with record.mjs
# (a swapped Facebook Reel gets a new URL) and push state.json/log.md/proof.

set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$HOME/bin:$PATH"
SEAT="ceo"
SEAT_DIR="$HOME/.claude-brain/profiles/$SEAT"
CLAUDE="${CLAUDE_BIN:-/opt/homebrew/bin/claude}"
STATE_DIR="$HOME/.config/devya-social"
DRY=0; ARGS=()
for a in "$@"; do [[ "$a" == "--dry-run" ]] && DRY=1 || ARGS+=("$a"); done

# Never overlap the daily routine.
LOCK="$STATE_DIR/run.lock"
mkdir -p "$STATE_DIR"
if ! mkdir "$LOCK" 2>/dev/null; then echo "the daily routine is running ($LOCK); try again later"; exit 1; fi
trap 'rm -rf "$LOCK"' EXIT

node social/render/audit.mjs --render || { echo "ERROR: audit failed; nothing changed"; exit 1; }
FIX_JSON="$(node social/routine/fix-published.mjs "${ARGS[@]+"${ARGS[@]}"}")" || exit 1
COUNT="$(printf '%s' "$FIX_JSON" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).items.length')"
echo "in-place fixes: $COUNT"
[[ "$COUNT" -eq 0 ]] && exit 0
if [[ "$DRY" == "1" ]]; then printf '%s\n' "$FIX_JSON"; echo "dry run: nothing edited"; exit 0; fi

TOOLS="mcp__claude-in-chrome__list_connected_browsers mcp__claude-in-chrome__select_browser mcp__claude-in-chrome__tabs_context_mcp mcp__claude-in-chrome__tabs_create_mcp mcp__claude-in-chrome__tabs_close_mcp mcp__claude-in-chrome__navigate mcp__claude-in-chrome__browser_batch mcp__claude-in-chrome__computer mcp__claude-in-chrome__find mcp__claude-in-chrome__get_page_text mcp__claude-in-chrome__read_page mcp__claude-in-chrome__form_input mcp__claude-in-chrome__javascript_tool mcp__claude-in-chrome__file_upload"
PROMPT="$(printf 'Fix these published Devya posts in place. Follow the system prompt exactly and end with one RESULT_JSON line.\n\n--- BEGIN fix.json ---\n%s\n--- END fix.json ---\n' "$FIX_JSON")"
# Every step of the session is streamed (stream-json) to a log as it happens,
# so a run that is killed part-way still shows which posts it changed: check
# those and record them before re-running (posts recorded with by: fix are
# skipped by the audit, so a re-run never edits or swaps them again).
FIXLOG="$HOME/Library/Logs/devya-social-fix-$(date '+%Y%m%d-%H%M%S').jsonl"
echo "session log: $FIXLOG"
CLAUDE_CONFIG_DIR="$SEAT_DIR" "$CLAUDE" --print --chrome --output-format stream-json --verbose --allowed-tools "$TOOLS" \
  --append-system-prompt "$(cat social/routine/fix-published-worker.md)" "$PROMPT" > "$FIXLOG"
OUT="$(node -e '
  const lines = require("fs").readFileSync(process.argv[1], "utf8").split("\n").filter(Boolean);
  let text = "";
  for (const l of lines) { try { const e = JSON.parse(l); if (e.type === "result" && typeof e.result === "string") text = e.result; } catch {} }
  process.stdout.write(text);
' "$FIXLOG")"
printf '%s\n' "$OUT"
RESULT="$(printf '%s\n' "$OUT" | grep -E '^RESULT_JSON:' | tail -n1 | sed 's/^RESULT_JSON: *//')"
[[ -z "$RESULT" ]] && { echo "ERROR: no RESULT_JSON; check the posts by hand before re-running"; exit 1; }

# record.mjs takes one date at a time: split "<network>@<date>" keys by date.
printf '%s' "$RESULT" | node -e '
  const r = JSON.parse(require("fs").readFileSync(0, "utf8")).results || {};
  const by = {};
  for (const [k, v] of Object.entries(r)) { const [net, date] = k.split("@"); (by[date] ||= {})[net] = { ...v, note: `edited in place: ${v.note || ""}` }; }
  for (const [date, results] of Object.entries(by)) console.log(JSON.stringify({ date, results }));
' | while IFS= read -r line; do printf '%s' "$line" | node social/routine/record.mjs --by fix; done

git add social/state.json social/log.md social/proof
if ! git diff --cached --quiet; then
  git commit -q -m "social: published posts fixed in place ($COUNT item(s))" && git push -q origin HEAD:main || echo "ERROR: could not push; the next routine run pushes it"
fi
