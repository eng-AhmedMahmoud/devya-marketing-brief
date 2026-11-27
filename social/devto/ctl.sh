#!/usr/bin/env bash
# Control the dev.to comment replies routine (launchd label com.ahmedmahmoud.devya-devto-replies).
# Installed as ~/.config/devya-social/bin/devto.
#
#   devto review [--all]          the drafts waiting for you (also in ~/.config/devya-social/devto/queue.md)
#   devto approve <id> [<id>...]  approve those exact drafts (an edit afterwards needs a new approval)
#   devto reject <id> [<id>...]   reject drafts / dismiss flagged comments
#   devto edit <id> [--text "…"]  rewrite a draft ($EDITOR without --text); it goes back to pending
#   devto post                    post the approved drafts (Chrome on the DEVTO_POST_SEAT seat, default ceo)
#   devto status                  loaded?, paused?, queue counts, last run, Keychain check
#   devto run                     fire one draft run now (never posts)
#   devto pause [why] | resume    keep the schedule, make draft runs exit at once
#   devto log                     last lines of the routine log
#   social/devto/ctl.sh install   (re)install launcher + this script, write the plist (daily 08:30), load it, register it in brain
#   devto uninstall               unload and remove the plist (queue, state and logs stay)

set -euo pipefail
LABEL="com.ahmedmahmoud.devya-devto-replies"
STATE_DIR="$HOME/.config/devya-social"
DEVTO_HOME="${DEVTO_HOME:-$STATE_DIR/devto}"
BIN="$STATE_DIR/bin"
CLONE="$STATE_DIR/devya-marketing-brief"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/devya-devto-replies.log"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UIDN="$(id -u)"
DEVTO_JS="$HERE/devto.mjs"
[[ -f "$DEVTO_JS" ]] || DEVTO_JS="$CLONE/social/devto/devto.mjs"
export DEVTO_HOME

cmd_install() {
  [[ -f "$HERE/run-devto-replies.sh" && -f "$HERE/$LABEL.plist" ]] || { echo "run install from the repo: social/devto/ctl.sh install"; exit 1; }
  mkdir -p "$BIN" "$DEVTO_HOME"
  install -m 755 "$HERE/run-devto-replies.sh" "$BIN/run-devto-replies.sh"
  install -m 755 "$HERE/ctl.sh" "$BIN/devto"
  # `devto` on PATH (~/bin), unless something else already owns that name.
  if [[ -d "$HOME/bin" ]] && { [[ ! -e "$HOME/bin/devto" ]] || [[ "$(readlink "$HOME/bin/devto")" == "$BIN/devto" ]]; }; then ln -sf "$BIN/devto" "$HOME/bin/devto"; fi
  sed -e "s#__LAUNCHER__#$BIN/run-devto-replies.sh#" -e "s#__HOME__#$HOME#g" "$HERE/$LABEL.plist" > "$PLIST"
  plutil -lint "$PLIST" >/dev/null
  launchctl bootout "gui/$UIDN/$LABEL" 2>/dev/null || true
  launchctl bootstrap "gui/$UIDN" "$PLIST"
  local RJ="$HOME/.claude-brain/routines.json"
  if [[ -f "$RJ" ]]; then
    node -e '
      const fs = require("fs"); const f = process.argv[1]; const j = JSON.parse(fs.readFileSync(f, "utf8"));
      j.routines[process.argv[2]] = {
        name: "dev.to Comment Replies",
        description: "Every morning (08:30 Cairo) reads every dev.to article of @ahmed_mahmoud360 and its comments through the Forem API (key from the Keychain), drafts a reply in his voice to each new comment (spam and abuse are flagged, never drafted) and queues them for review in ~/.config/devya-social/devto/queue.md. Draft-only: it never posts. Review with `devto review`, approve with `devto approve <ids>`, post the approved ones with `devto post` (devya-marketing-brief social/devto).",
        group: "routine",
        logs: "~/Library/Logs/devya-devto-replies.log",
        output: "~/.config/devya-social/devto/queue.md"
      };
      fs.writeFileSync(f, JSON.stringify(j, null, 1) + "\n");
    ' "$RJ" "$LABEL"
  fi
  echo "installed $LABEL → $BIN/run-devto-replies.sh (daily 08:30); control: $BIN/devto"
  cmd_status
}

cmd_status() {
  if launchctl print "gui/$UIDN/$LABEL" >/dev/null 2>&1; then echo "launchd: loaded ($PLIST)"; else echo "launchd: NOT loaded"; fi
  if [[ -f "$DEVTO_HOME/paused" ]]; then echo "paused: yes ($(cat "$DEVTO_HOME/paused"))"; else echo "paused: no"; fi
  node "$DEVTO_JS" status || true
  [[ -f "$LOG" ]] && { echo "--- last log lines"; tail -n 6 "$LOG"; }
}

case "${1:-status}" in
  install) cmd_install ;;
  status) cmd_status ;;
  review|approve|reject|edit) node "$DEVTO_JS" "$@" ;;
  post) exec "$BIN/run-devto-replies.sh" post ;;
  run) launchctl kickstart "gui/$UIDN/$LABEL" && echo "started a draft run; follow: tail -f $LOG" ;;
  pause) shift; mkdir -p "$DEVTO_HOME"; echo "${*:-paused $(date '+%Y-%m-%d %H:%M')}" > "$DEVTO_HOME/paused"; echo "paused (draft runs exit at once). Resume: devto resume" ;;
  resume) rm -f "$DEVTO_HOME/paused"; echo "resumed" ;;
  log) tail -n "${2:-40}" "$LOG" ;;
  uninstall) launchctl bootout "gui/$UIDN/$LABEL" 2>/dev/null || true; rm -f "$PLIST"; echo "uninstalled (queue, state and logs kept in $DEVTO_HOME)" ;;
  *) echo "usage: devto review [--all] | approve <ids> | reject <ids> | edit <id> | post | status | run | pause [why] | resume | log | install | uninstall"; exit 1 ;;
esac
