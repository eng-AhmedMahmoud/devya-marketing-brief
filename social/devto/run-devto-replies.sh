#!/usr/bin/env bash
# dev.to comment replies routine. launchd fires it daily at 08:30 Cairo
# (com.ahmedmahmoud.devya-devto-replies) in DRAFT mode:
#   1. fast-forwards the routine clone of devya-marketing-brief to origin/main
#      (skipped while the social routine holds its lock; never resets local work);
#   2. runs social/devto/devto.mjs scan: reads the dev.to API key from the macOS
#      Keychain (missing/rejected key: one NEEDS-YOU line, exit 5), lists every
#      article of @ahmed_mahmoud360 and its comment tree, skips comments already
#      seen, his own, deleted ones and threads he already answered, flags spam
#      and abuse, drafts replies with a tool-less Claude session and queues them
#      in ~/.config/devya-social/devto/queue.json (+ queue.md);
#   3. logs the run summary (DEVTO_SUMMARY line here, runs.jsonl there).
# Draft mode never posts, reacts or writes to dev.to.
#
#   run-devto-replies.sh post   (by hand, after `devto approve <ids>`)
#       posts ONLY approved drafts whose approval record matches their exact
#       text (devto.mjs post-plan), through a Chrome-tools-only Claude session on
#       the DEVTO_POST_SEAT seat (default ceo: Chrome "Profile 2", which must be
#       signed in to dev.to as @ahmed_mahmoud360), then records only what dev.to's
#       API shows under each comment (devto.mjs post-record).
#
# Pause:  ~/.config/devya-social/bin/devto pause   (or touch ~/.config/devya-social/devto/paused)
# Log:    ~/Library/Logs/devya-devto-replies.log

set -uo pipefail

if [[ "${DEVTO_CAFFEINATED:-0}" != "1" ]]; then
  export DEVTO_CAFFEINATED=1
  exec /usr/bin/caffeinate -ims "$0" "$@"
fi

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/bin"
export USER="${USER:-$(id -un)}" LOGNAME="${LOGNAME:-$(id -un)}"
unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN CLAUDECODE CLAUDE_CODE_ENTRYPOINT

NAME="devya-devto-replies"
MODE="${1:-draft}"
STATE_DIR="$HOME/.config/devya-social"
export DEVTO_HOME="${DEVTO_HOME:-$STATE_DIR/devto}"
CLONE="${DEVTO_REPO:-$STATE_DIR/devya-marketing-brief}"
CLAUDE="${CLAUDE_BIN:-/opt/homebrew/bin/claude}"
LOG="$HOME/Library/Logs/$NAME.log"
mkdir -p "$DEVTO_HOME" "$(dirname "$LOG")"
if [[ -t 1 ]]; then exec > >(tee -a "$LOG") 2>&1; else exec >>"$LOG" 2>&1; fi

ts() { date '+%Y-%m-%d %H:%M:%S %Z'; }
echo
echo "=============================================================="
echo "[$(ts)] $NAME $MODE run starting"

if [[ "$MODE" != "draft" && "$MODE" != "post" ]]; then
  echo "usage: $0 [draft|post]"; exit 2
fi
if [[ "$MODE" == "draft" && -f "$DEVTO_HOME/paused" ]]; then
  echo "paused: $DEVTO_HOME/paused exists ($(cat "$DEVTO_HOME/paused" 2>/dev/null)). Nothing to do."
  exit 0
fi

LOCK="$DEVTO_HOME/run.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  if [[ -n "$(find "$LOCK" -maxdepth 0 -mmin +90 2>/dev/null)" ]]; then rm -rf "$LOCK"; mkdir "$LOCK"; else echo "another dev.to run holds $LOCK; exiting"; exit 0; fi
fi
trap 'rm -rf "$LOCK"' EXIT

for _n in $(seq 1 90); do
  /usr/bin/curl -sS -m 4 -o /dev/null "https://dev.to/" 2>/dev/null && break
  echo "waiting for network... ($_n)"; sleep 2
done

# The clone belongs to the social routine (it resets it to origin/main). Only
# fast-forward it, and only while that routine is not running.
cd "$CLONE" || { echo "ERROR: no clone at $CLONE (the social routine creates it)"; exit 1; }
if [[ -z "${DEVTO_REPO:-}" ]]; then
  if [[ -d "$STATE_DIR/run.lock" ]]; then
    echo "social routine is running; using the clone as it is ($(git rev-parse --short HEAD))"
  elif git fetch -q origin main && [[ "$(git rev-parse --abbrev-ref HEAD)" == "main" ]]; then
    git merge -q --ff-only origin/main 2>/dev/null || echo "WARN: clone not fast-forwarded ($(git rev-parse --short HEAD)); running it as it is"
  fi
fi
[[ -f social/devto/devto.mjs ]] || { echo "ERROR: social/devto/devto.mjs missing in $CLONE"; exit 1; }
DEVTO="node social/devto/devto.mjs"

draft_run() {
  $DEVTO scan
}

post_run() {
  local SEAT="${DEVTO_POST_SEAT:-ceo}" PLAN RESULT OUT DEVICE_ID PRE_JSON PRE_RC READY
  PLAN="$($DEVTO post-plan)" || { echo "ERROR: post-plan failed"; return 1; }
  READY="$(printf '%s' "$PLAN" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).ready.length')"
  printf '%s' "$PLAN" | node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8")); for (const k of ["stale","found","blocked"]) for (const x of j[k]||[]) console.log(`${k}: ${x.id} ${x.reason||x.url||""}`)'
  if [[ "$READY" -eq 0 ]]; then echo "nothing approved to post"; return 0; fi
  echo "posting $READY approved repl(y/ies) through the $SEAT seat's Chrome"
  PRE_JSON="$(node social/routine/preflight.mjs browser --seat "$SEAT")"; PRE_RC=$?
  echo "$(printf '%s' "$PRE_JSON" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).line' 2>/dev/null)"
  [[ $PRE_RC -eq 3 ]] && return 5
  DEVICE_ID="$(printf '%s' "$PRE_JSON" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).deviceId || ""' 2>/dev/null)"
  local TOOLS="mcp__claude-in-chrome__list_connected_browsers mcp__claude-in-chrome__select_browser mcp__claude-in-chrome__tabs_context_mcp mcp__claude-in-chrome__tabs_create_mcp mcp__claude-in-chrome__tabs_close_mcp mcp__claude-in-chrome__navigate mcp__claude-in-chrome__computer mcp__claude-in-chrome__find mcp__claude-in-chrome__get_page_text mcp__claude-in-chrome__read_page mcp__claude-in-chrome__form_input"
  local PROMPT
  PROMPT="$(printf 'Post these approved dev.to replies, in this order. Follow the system prompt exactly and end with one RESULT_JSON line.\n\n--- BEGIN plan ---\n%s\n--- END plan ---\n' "$(printf '%s' "$PLAN" | node -pe 'JSON.stringify(JSON.parse(require("fs").readFileSync(0,"utf8")).ready.map(({id,commentUrl,articleTitle,author,reply})=>({id,commentUrl,articleTitle,author,reply})),null,1)')")"
  [[ -n "$DEVICE_ID" ]] && PROMPT="$(printf '%s\nBrowser: the %s seat'"'"'s Chrome is deviceId %s. If list_connected_browsers lists more than one browser, select_browser this deviceId; never use another.\n' "$PROMPT" "$SEAT" "$DEVICE_ID")"
  OUT="$(CLAUDE_CONFIG_DIR="$HOME/.claude-brain/profiles/$SEAT" "$CLAUDE" --print --chrome --allowed-tools "$TOOLS" \
    --append-system-prompt "$(cat social/devto/post-worker.md)" "$PROMPT")"
  printf '%s\n' "$OUT"
  RESULT="$(printf '%s\n' "$OUT" | grep -E '^RESULT_JSON:' | tail -n1)"
  if [[ -z "$RESULT" ]]; then echo "ERROR: no RESULT_JSON; nothing recorded. Check the threads by hand before posting again (post-plan re-checks them)."; return 1; fi
  printf '%s' "$RESULT" | $DEVTO post-record
}

RC=0
if [[ "$MODE" == "post" ]]; then post_run; RC=$?; else draft_run; RC=$?; fi
echo "[$(ts)] run finished (rc $RC)"
exit "$RC"
