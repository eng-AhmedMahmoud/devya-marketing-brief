#!/usr/bin/env bash
# Control the Devya daily social routine (launchd label com.ahmedmahmoud.devya-social-daily).
#
#   ctl.sh install    copy the launcher + this script to ~/.config/devya-social/bin,
#                     write the plist (10:00, 13:00, 19:30, 21:00), load it, register it in brain
#   ctl.sh pause [why]  keep the schedule but make every run exit at once
#   ctl.sh resume     undo pause
#   ctl.sh status     loaded?, paused?, what is due now, last log lines
#   ctl.sh run        fire one run now (publishes only what is due)
#   ctl.sh uninstall  unload and remove the plist (calendar and logs stay)

set -euo pipefail
LABEL="com.ahmedmahmoud.devya-social-daily"
STATE_DIR="$HOME/.config/devya-social"
BIN="$STATE_DIR/bin"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/devya-social-daily.log"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UIDN="$(id -u)"

cmd_install() {
  mkdir -p "$BIN"
  install -m 755 "$HERE/run-daily-social.sh" "$BIN/run-daily-social.sh"
  install -m 755 "$HERE/ctl.sh" "$BIN/ctl.sh"
  sed -e "s#__LAUNCHER__#$BIN/run-daily-social.sh#" -e "s#__HOME__#$HOME#g" "$HERE/$LABEL.plist" > "$PLIST"
  plutil -lint "$PLIST" >/dev/null
  launchctl bootout "gui/$UIDN/$LABEL" 2>/dev/null || true
  launchctl bootstrap "gui/$UIDN" "$PLIST"
  # Name, description and logs for brain's Routines tab (schedules are read from the plist).
  local RJ="$HOME/.claude-brain/routines.json"
  if [[ -f "$RJ" ]]; then
    node -e '
      const fs = require("fs"); const f = process.argv[1]; const j = JSON.parse(fs.readFileSync(f, "utf8"));
      j.routines[process.argv[2]] = {
        name: "Devya Social Daily",
        description: "Publishes the next devya-marketing-brief social calendar entry on Devya'"'"'s LinkedIn page (10:00 post, 13:00 video), Facebook page and Instagram (13:00 Reels, 19:30/21:00 posts and Stories) through Claude in Chrome on the ceo seat (Chrome Profile 2), logs each post to social/log.md, and tops the calendar up when fewer than 7 days remain.",
        group: "routine",
        logs: "~/Library/Logs/devya-social-daily.log",
        output: "~/.config/devya-social/devya-marketing-brief/social/log.md"
      };
      fs.writeFileSync(f, JSON.stringify(j, null, 1) + "\n");
    ' "$RJ" "$LABEL"
  fi
  echo "installed $LABEL → $BIN/run-daily-social.sh"
  cmd_status
}

cmd_pause() { mkdir -p "$STATE_DIR"; echo "${1:-paused $(date '+%Y-%m-%d %H:%M')}" > "$STATE_DIR/paused"; echo "paused (runs exit at once). Resume: $0 resume"; }
cmd_resume() { rm -f "$STATE_DIR/paused"; echo "resumed"; }

cmd_status() {
  if launchctl print "gui/$UIDN/$LABEL" >/dev/null 2>&1; then echo "launchd: loaded ($PLIST)"; else echo "launchd: NOT loaded"; fi
  if [[ -f "$STATE_DIR/paused" ]]; then echo "paused: yes ($(cat "$STATE_DIR/paused"))"; else echo "paused: no"; fi
  local C="$STATE_DIR/devya-marketing-brief"
  [[ -d "$C" ]] && (cd "$C" && node social/routine/due.mjs | node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log(`today ${j.date} day ${j.day ?? "-"}: due now [${j.due.map(d=>d.network).join(", ")}], ${j.remaining} day(s) queued after today, calendar ends ${j.lastDate}`)')
  [[ -f "$LOG" ]] && { echo "--- last log lines"; tail -n 8 "$LOG"; }
}

cmd_run() { launchctl kickstart "gui/$UIDN/$LABEL" && echo "started; follow: tail -f $LOG"; }
cmd_uninstall() { launchctl bootout "gui/$UIDN/$LABEL" 2>/dev/null || true; rm -f "$PLIST"; echo "uninstalled (calendar, state and logs kept)"; }

case "${1:-status}" in
  install) cmd_install ;;
  pause) shift; cmd_pause "$*" ;;
  resume) cmd_resume ;;
  status) cmd_status ;;
  run) cmd_run ;;
  uninstall) cmd_uninstall ;;
  *) echo "usage: $0 install|pause [why]|resume|status|run|uninstall"; exit 1 ;;
esac
