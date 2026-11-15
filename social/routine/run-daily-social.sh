#!/usr/bin/env bash
# Devya daily social routine. launchd fires it at 10:00, 13:00, 19:30 and 21:00
# (com.ahmedmahmoud.devya-social-daily). Each run:
#   1. syncs a routine-owned clone of devya-marketing-brief to origin/main;
#   2. asks routine/due.mjs which networks are due now (slot passed, not yet
#      published today) and renders today's cards if they are missing;
#   3. runs a tightly allowlisted Claude session on the ceo seat
#      (CLAUDE_CONFIG_DIR = brain profile ceo → Chrome "Profile 2", Devya) that
#      publishes through Claude in Chrome and prints one RESULT_JSON line;
#   4. records the result with routine/record.mjs (state.json, log.md, proof/)
#      and commits + pushes just those files — the model never touches git;
#   5. once a day, when fewer than 7 calendar days remain, runs the top-up
#      worker, then merge-days.mjs validates, renders and merges its draft.
#
# Pause:  ~/.config/devya-social/bin/ctl.sh pause   (or touch ~/.config/devya-social/paused)
# Log:    ~/Library/Logs/devya-social-daily.log

set -uo pipefail

# Keep the Mac awake for exactly this run (same reason as claude-cl.sh).
if [[ "${DEVYA_SOCIAL_CAFFEINATED:-0}" != "1" ]]; then
  export DEVYA_SOCIAL_CAFFEINATED=1
  exec /usr/bin/caffeinate -ims "$0" "$@"
fi

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/bin"
export USER="${USER:-$(id -un)}" LOGNAME="${LOGNAME:-$(id -un)}"
unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN CLAUDECODE CLAUDE_CODE_ENTRYPOINT

NAME="devya-social-daily"
STATE_DIR="$HOME/.config/devya-social"
CLONE="$STATE_DIR/devya-marketing-brief"
REMOTE="https://github.com/eng-AhmedMahmoud/devya-marketing-brief.git"
SEAT="ceo"
SEAT_DIR="$HOME/.claude-brain/profiles/$SEAT"
CLAUDE="${CLAUDE_BIN:-/opt/homebrew/bin/claude}"
LOG="$HOME/Library/Logs/$NAME.log"
mkdir -p "$STATE_DIR" "$(dirname "$LOG")"
exec >>"$LOG" 2>&1

ts() { date '+%Y-%m-%d %H:%M:%S %Z'; }
echo
echo "=============================================================="
echo "[$(ts)] $NAME run starting (args: $*)"

if [[ -f "$STATE_DIR/paused" ]]; then
  echo "paused: $STATE_DIR/paused exists ($(cat "$STATE_DIR/paused" 2>/dev/null)). Nothing to do."
  exit 0
fi

# One run at a time (the three slots can overlap if a run is slow).
LOCK="$STATE_DIR/run.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  if [[ -n "$(find "$LOCK" -maxdepth 0 -mmin +90 2>/dev/null)" ]]; then rm -rf "$LOCK"; mkdir "$LOCK"; else echo "another run holds $LOCK; exiting"; exit 0; fi
fi
trap 'rm -rf "$LOCK"' EXIT

# Cold-wake network wait (up to 180 s), as in the cross-post launcher.
for _n in $(seq 1 90); do
  /usr/bin/curl -sS -m 4 -o /dev/null "https://api.anthropic.com/" 2>/dev/null && break
  echo "waiting for network... ($_n)"; sleep 2
done

# Routine-owned clone, always reset to origin/main (the developer's working copy is never touched).
if [[ ! -d "$CLONE/.git" ]]; then git clone -q "$REMOTE" "$CLONE" || { echo "ERROR: clone failed"; exit 1; }; fi
cd "$CLONE" || exit 1
git fetch -q origin main && git checkout -q main || { echo "ERROR: git sync failed"; exit 1; }
# A previous run's publish log that never reached GitHub must not be thrown away:
# state.json is what stops a network being published twice.
if [[ "$(git rev-list --count origin/main..main)" -gt 0 ]]; then
  echo "local publish log not yet pushed; pushing it first"
  git pull -q --rebase origin main && git push -q origin main || echo "WARN: still unpushed; keeping local state"
else
  git reset -q --hard origin/main
fi
git config user.name >/dev/null || git config user.name "Devya social routine"
if [[ ! -d social/render/node_modules ]]; then (cd social/render && pnpm install --frozen-lockfile --silent) || { echo "ERROR: render deps"; exit 1; }; fi

push_with_retry() {
  for _try in 1 2 3; do
    git push -q origin main && return 0
    echo "push rejected; rebasing (try $_try)"; git pull -q --rebase origin main || return 1
  done
  return 1
}

DUE_JSON="$(node social/routine/due.mjs "$@")" || { echo "ERROR: due.mjs failed"; exit 1; }
TODAY="$(printf '%s' "$DUE_JSON" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).date')"
COUNT="$(printf '%s' "$DUE_JSON" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).due.length')"
REMAINING="$(printf '%s' "$DUE_JSON" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).remaining')"
echo "held (pausedChannels): $(printf '%s' "$DUE_JSON" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).held.map(h=>h.network).join(", ")||"none"')"
echo "today $TODAY · due now: $(printf '%s' "$DUE_JSON" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).due.map(d=>d.network).join(", ")||"none"') · calendar days left after today: $REMAINING"

RC=0
if [[ "$COUNT" -gt 0 ]]; then
  node social/render/render.mjs --date "$TODAY" || echo "WARN: render reported a problem for $TODAY"
  # Reels, stories and the LinkedIn video use the day's vertical video (git-ignored, rendered here).
  if printf '%s' "$DUE_JSON" | grep -q '"kind": "\(reel\|video\|story\)"'; then
    node social/render/render-reel.mjs --date "$TODAY" || echo "WARN: reel render reported a problem for $TODAY"
  fi

  # Seat preflight: the ceo seat's Chrome profile open, CIC connected and paired as ceo@devya.dev.
  if command -v brain >/dev/null 2>&1; then
    brain chrome check "$SEAT" --no-pages || echo "WARN: brain chrome check $SEAT reported a problem"
  elif [[ -x "$HOME/bin/ensure-chrome.sh" ]]; then
    "$HOME/bin/ensure-chrome.sh" --headless || { echo "ERROR: Chrome preflight failed"; exit 2; }
  fi

  BEFORE_TABS="$(/usr/bin/mktemp -t social-tabs)"
  /usr/bin/osascript -e 'set out to ""' -e 'tell application id "com.google.Chrome"' \
    -e 'repeat with w in windows' -e 'repeat with t in tabs of w' -e 'set out to out & (URL of t) & linefeed' \
    -e 'end repeat' -e 'end repeat' -e 'end tell' -e 'return out' > "$BEFORE_TABS" 2>/dev/null || true

  USER_PROMPT="$(printf 'Today is %s (Cairo). Publish these posts, in this order. Follow the system prompt exactly and end with one RESULT_JSON line.\n\n--- BEGIN due.json ---\n%s\n--- END due.json ---\n' "$TODAY" "$DUE_JSON")"
  if [[ "${DEVYA_SOCIAL_DRY_RUN:-0}" == "1" ]]; then
    USER_PROMPT="$(printf 'DRY RUN. Do NOT open any composer and do NOT publish anything. For each network below only: open the account page from the system prompt, confirm it loads signed in and acting as the Devya account (check the identity markers the system prompt lists), and run the duplicate check. Report every network with status "skipped", url null, proof null, and a note saying what you verified or what blocked you.\n\n%s' "$USER_PROMPT")"
  fi
  TOOLS="mcp__claude-in-chrome__list_connected_browsers mcp__claude-in-chrome__select_browser mcp__claude-in-chrome__tabs_context_mcp mcp__claude-in-chrome__tabs_create_mcp mcp__claude-in-chrome__tabs_close_mcp mcp__claude-in-chrome__navigate mcp__claude-in-chrome__browser_batch mcp__claude-in-chrome__computer mcp__claude-in-chrome__find mcp__claude-in-chrome__get_page_text mcp__claude-in-chrome__read_page mcp__claude-in-chrome__form_input mcp__claude-in-chrome__javascript_tool mcp__claude-in-chrome__file_upload"

  # No Read/Write/Bash: the session can only drive Chrome. The seat's config dir
  # makes it run as ceo@devya.dev, whose CIC device is Chrome "Profile 2".
  OUT="$(CLAUDE_CONFIG_DIR="$SEAT_DIR" "$CLAUDE" --print --chrome \
      --allowed-tools "$TOOLS" \
      --append-system-prompt "$(cat social/routine/publish-worker.md)" \
      "$USER_PROMPT")"
  CL_EXIT=$?

  "$HOME/bin/close-new-chrome-tabs.sh" "$BEFORE_TABS" 2>/dev/null || true
  /bin/rm -f "$BEFORE_TABS"
  printf '%s\n' "$OUT"

  RESULT="$(printf '%s\n' "$OUT" | grep -E '^RESULT_JSON:' | tail -n1 | sed 's/^RESULT_JSON: *//')"
  if [[ "${DEVYA_SOCIAL_DRY_RUN:-0}" == "1" ]]; then
    echo "dry run: result not recorded: $RESULT"
  elif [[ -z "$RESULT" || "$RESULT" == "null" ]]; then
    echo "ERROR: no RESULT_JSON (claude exit $CL_EXIT). Nothing recorded; the next slot retries what is still due."
    RC=1
  else
    printf '%s' "$RESULT" | node social/routine/record.mjs --by routine; RC=$?
    [[ $RC -eq 3 ]] && echo "NEEDS-YOU: a network was blocked or failed; see the last rows of social/log.md"
    git add social/state.json social/log.md social/proof
    if ! git diff --cached --quiet; then
      git commit -q -m "social: publish log for $TODAY ($(printf '%s' "$DUE_JSON" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).due.map(d=>d.network).join(", ")'))" && push_with_retry || echo "ERROR: could not push the publish log"
    fi
  fi
fi

# Top-up: once a day, when fewer than 7 days remain after today.
TOPUP_MARK="$STATE_DIR/topup-$TODAY"
if [[ "${DEVYA_SOCIAL_DRY_RUN:-0}" != "1" && "$REMAINING" -lt 7 && ! -f "$TOPUP_MARK" ]]; then
  touch "$TOPUP_MARK"
  ADD=$(( 14 - REMAINING ))
  LAST="$(printf '%s' "$DUE_JSON" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).lastDate')"
  echo "[$(ts)] top-up: $REMAINING day(s) left, drafting $ADD more after $LAST"
  mkdir -p social/inbox
  TOPUP_TOOLS="Read Glob Grep WebFetch(domain:www.devya.dev) Write(social/inbox/**) Edit(social/inbox/**)"
  TOPUP_PROMPT="$(printf 'Today is %s. The calendar ends on %s with %s day(s) left after today. Draft exactly %s new days starting the day after %s and write them to social/inbox/new-days.json.' "$TODAY" "$LAST" "$REMAINING" "$ADD" "$LAST")"
  for attempt in 1 2; do
    CLAUDE_CONFIG_DIR="$SEAT_DIR" "$CLAUDE" --print --allowed-tools "$TOPUP_TOOLS" \
      --append-system-prompt "$(cat social/routine/topup-worker.md)" "$TOPUP_PROMPT" | tail -n 5
    MERGE_OUT="$(node social/routine/merge-days.mjs 2>&1)"; MERGE_RC=$?
    printf '%s\n' "$MERGE_OUT"
    [[ $MERGE_RC -eq 0 ]] && break
    TOPUP_PROMPT="$(printf '%s\n\nYour previous draft was rejected. Fix every problem below and write the whole file again:\n%s' "$TOPUP_PROMPT" "$MERGE_OUT")"
  done
  if [[ $MERGE_RC -eq 0 ]]; then
    git add social/calendar.json social/calendar.md social/visuals
    git commit -q -m "social: top up calendar ($ADD days after $LAST)" && push_with_retry || echo "ERROR: could not push the top-up"
  else
    echo "NEEDS-YOU: top-up failed twice; the calendar was not extended. It retries tomorrow."
    rm -f social/inbox/new-days.json
    [[ $RC -eq 0 ]] && RC=4
  fi
fi

echo "[$(ts)] run finished (rc $RC)"
exit "$RC"
