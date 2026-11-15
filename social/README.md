# Devya social

Daily content on Devya's own LinkedIn page, Facebook page and Instagram, published by a routine on the developer's Mac: a feed post on each network, plus one 10-second vertical video used as the Facebook and Instagram Reel, the LinkedIn video, and the Facebook and Instagram Story.

| File | What it is |
|---|---|
| [`STRATEGY.md`](STRATEGY.md) | Audience, pillars, tone per network, language, visuals, hashtags, posting times, quality gate, advisor review |
| [`calendar.json`](calendar.json) | **Source of truth**: every day's topic, card text (EN + AR) and the exact caption per network |
| [`calendar.md`](calendar.md) | Readable view of the calendar with each card. Generated; never edit by hand |
| `visuals/<date>/` | `linkedin.png` 1200×627, `facebook.png` and `instagram.png` 1080×1350; `reel-en.mp4` / `reel-ar.mp4` 1080×1920 (+ cover JPGs) are rendered on the day and git-ignored |
| [`log.md`](log.md) | Every publish: date, network, language, status, post URL, proof screenshot |
| `state.json` | What has been published (the routine reads it so nothing is posted twice) |
| `proof/` | Screenshot of each live post |
| `render/` | Card renderer (HTML/CSS → PNG via Playwright), reel renderer (animated card → H.264 via ffmpeg), validator, `calendar.md` builder |
| `routine/` | The daily routine: launcher, worker prompts, helpers, launchd plist, `ctl.sh` |

## How the routine works

`launchd` (`com.ahmedmahmoud.devya-social-daily`) runs `~/.config/devya-social/bin/run-daily-social.sh` at **10:00, 13:00, 19:30 and 21:00** Cairo time.

1. It resets its own clone (`~/.config/devya-social/devya-marketing-brief`) to `origin/main`. Your working copy is never touched.
2. `routine/due.mjs` lists the channels whose slot has passed today and that `state.json` has not recorded: LinkedIn post 10:00; LinkedIn video and Facebook/Instagram Reels 13:00; Facebook post and Story 19:30; Instagram post and Story 21:00. Channels listed under `pausedChannels` in `calendar.json` are held. A missed day is not posted late. The day's cards and video are rendered if missing.
3. A Claude session on the **ceo seat** (`CLAUDE_CONFIG_DIR=~/.claude-brain/profiles/ceo`, so Claude in Chrome drives Chrome "Profile 2", Devya) publishes them, following `routine/publish-worker.md`. It may only use the Chrome tools; no files, no shell, no git.
4. `routine/record.mjs` writes the result to `state.json`, `log.md` and `proof/`, and the launcher commits and pushes only those files to `main`.
5. Once a day, if fewer than 7 days are left after today, a top-up session drafts the next days (`routine/topup-worker.md`) into `inbox/new-days.json`; `routine/merge-days.mjs` validates, renders and merges them, or rejects the whole draft. New days land a week before they publish.

Full transcript of every run: `~/Library/Logs/devya-social-daily.log`. Brain's Routines tab lists it as "Devya Social Daily".

If a network shows a login, 2FA or verification screen, the routine stops that network, logs it as `blocked` with a `NEEDS-YOU` line, and carries on with the others.

## Controls

```bash
~/.config/devya-social/bin/ctl.sh status      # loaded? paused? what is due now, last log lines
~/.config/devya-social/bin/ctl.sh pause       # keep the schedule, every run exits at once
~/.config/devya-social/bin/ctl.sh resume
~/.config/devya-social/bin/ctl.sh run         # fire one run now (publishes only what is due)
~/.config/devya-social/bin/ctl.sh uninstall   # stop for good (calendar, state and logs stay)
social/routine/ctl.sh install                 # (re)install after changing the launcher or plist
```

Test without posting: `DEVYA_SOCIAL_DRY_RUN=1 ~/.config/devya-social/bin/run-daily-social.sh --now 2026-11-16T21:00`. The session opens each account, checks it is signed in as Devya, and reports without composing anything.

## Editing the calendar

- Change a caption or card: edit `calendar.json`, then from `social/render`: `node validate.mjs && node render.mjs --date <date> --force && node render-reel.mjs --date <date> --force && node build-md.mjs`. Commit to `main`; the routine picks it up on its next run.
- Hold a channel on every day (for example `instagram_story`): add it to `pausedChannels` in `calendar.json` with the reason; delete the key to switch it back on.
- Drop a day: set `"skip": true` on it. The slot stays empty and is logged; nothing is back-filled.
- First run in a fresh checkout: `cd social/render && pnpm install` (uses Playwright's cached Chromium).
