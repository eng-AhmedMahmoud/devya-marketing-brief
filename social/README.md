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
2. `routine/due.mjs` lists the channels whose slot has passed today and that `state.json` has not recorded: LinkedIn post 10:00; LinkedIn video and Facebook/Instagram Reels 13:00; Facebook post and Story 19:30; Instagram post and Story 21:00. Channels listed under `pausedChannels` in `calendar.json` are held. A missed day is not posted late.
   - **Browser preflight** (`routine/preflight.mjs browser`): when something is due, it asks brain whether the ceo seat's Chrome is connected through Claude in Chrome (one retry 30 s later). If not, the run logs a single `NEEDS-YOU:` line naming the fix (for example, the extension in "Profile 2" is signed in to another account), starts no session, records nothing in `log.md`, and exits 5; the next slot retries what is still due. If brain cannot answer, the run goes ahead with a `WARN:` line.
   - The day's cards and video are rendered if missing.
   - **Screenshot guard** (`render/shot-guard.mjs`): a `product` card's live screenshot (`card.shot`) is refused, never recorded, when its URL or redirect is on Vercel (`vercel.app`, `now.sh`: Vercel is banned since 2026-11-27), the page answers an HTTP error, or it shows a paused, suspended or error page or next to no text. The renderers then exit 4 with a `SHOT REFUSED:` line, and the run holds whatever would show that screenshot (feed posts if the cards could not be rendered, otherwise the videos and stories), logs one `NEEDS-YOU:` line and exits 6; the next slot retries. `validate.mjs` also rejects any `vercel.app` URL in a day, so a top-up draft carrying one is never merged.
3. A Claude session on the **ceo seat** (`CLAUDE_CONFIG_DIR=~/.claude-brain/profiles/ceo`, so Claude in Chrome drives Chrome "Profile 2", Devya) publishes them, following `routine/publish-worker.md`. It may only use the Chrome tools; no files, no shell, no git.
4. `routine/record.mjs` writes the result to `state.json`, `log.md` and `proof/`, and the launcher commits and pushes only those files to `main`.
5. Once a day, if fewer than 7 days are left after today, a top-up session drafts the next days (`routine/topup-worker.md`) into `inbox/new-days.json`; `routine/merge-days.mjs` validates, renders and merges them, or rejects the whole draft. New days land a week before they publish.

Full transcript of every run: `~/Library/Logs/devya-social-daily.log`. Brain's Routines tab lists it as "Devya Social Daily".

If a network shows a login, 2FA or verification screen, the routine stops that network, logs it as `blocked` with a `NEEDS-YOU` line, and carries on with the others.

If the publish session stops on a usage-limit banner, the transcript gets a `LIMIT:` line. A cap on the seat's model alone ("Switch to another model") is retried once at once with `--model sonnet` (`DEVYA_SOCIAL_FALLBACK_MODEL` overrides); a cap on the seat itself waits for the first slot after the reset.

Tests for the routine's helpers and the screenshot guard: `node --test social/routine/*.test.mjs social/render/*.test.mjs`.

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
