# Devya social

Daily content on Devya's own LinkedIn page, Facebook page and Instagram, published by a routine on the developer's Mac: a feed post on each network, plus one 10-second vertical video (with a licensed music bed) used as the Facebook and Instagram Reel, the LinkedIn video, and the Facebook and Instagram Story.

Every post is built to four permanent rules, enforced by code and tests (see **Brand, music and links** below): the official Devya logo, the black and silver theme of www.devya.dev, a professional music bed on every video, and tagged, SEO-ready links and captions.

| File | What it is |
|---|---|
| [`STRATEGY.md`](STRATEGY.md) | Audience, pillars, tone per network, language, visuals, hashtags, posting times, quality gate, advisor review |
| [`calendar.json`](calendar.json) | **Source of truth**: every day's topic, card text (EN + AR) and the exact caption per network |
| [`calendar.md`](calendar.md) | Readable view of the calendar with each card. Generated; never edit by hand |
| `visuals/<date>/` | `linkedin.png` 1200×627, `facebook.png` and `instagram.png` 1080×1350; `reel-en.mp4` / `reel-ar.mp4` 1080×1920 with their cover JPG, `.srt` subtitles and `.json` recipe stamp are rendered on the day and git-ignored |
| [`brand/`](brand/README.md) | The official Devya wordmark (`devya-wordmark.svg`, copied byte for byte from www.devya.dev) and where the colour tokens come from |
| [`music/`](music/LICENSES.md) | The music beds (`tracks.json`) and `LICENSES.md`: each track's source, licence (CC0) and hash |
| [`videos.json`](videos.json) | Videos on Devya's YouTube channel (@DevyaSolutions) that posts may link to, e.g. the Moving pitch videos |
| [`audit/`](audit/) | Audits of every published and scheduled post (`render/audit.mjs`): what falls short, the exact caption fixes, replacement media, and what can only be fixed by reposting |
| [`log.md`](log.md) | Every publish: date, network, language, status, post URL, proof screenshot |
| `state.json` | What has been published (the routine reads it so nothing is posted twice) |
| `proof/` | Screenshot of each live post |
| `render/` | Card renderer (HTML/CSS → PNG via Playwright), reel renderer (animated card + music → H.264/AAC via ffmpeg), brand checks, audio mixer, link/SEO rules, validator, `calendar.md` builder |
| `routine/` | The daily routine: launcher, worker prompts, helpers, launchd plist, `ctl.sh` |

## How the routine works

`launchd` (`com.ahmedmahmoud.devya-social-daily`) runs `~/.config/devya-social/bin/run-daily-social.sh` at **10:00, 13:00, 19:30 and 21:00** Cairo time.

1. It resets its own clone (`~/.config/devya-social/devya-marketing-brief`) to `origin/main`. Your working copy is never touched.
2. `routine/due.mjs` lists the channels whose slot has passed today and that `state.json` has not recorded: LinkedIn post 10:00; LinkedIn video and Facebook/Instagram Reels 13:00; Facebook post and Story 19:30; Instagram post and Story 21:00. Channels listed under `pausedChannels` in `calendar.json` are held. A missed day is not posted late.
   - **Browser preflight** (`routine/preflight.mjs browser`): when something is due, it asks brain whether the ceo seat's Chrome is connected through Claude in Chrome (one retry 30 s later). If not, the run logs a single `NEEDS-YOU:` line naming the fix (for example, the extension in "Profile 2" is signed in to another account), starts no session, records nothing in `log.md`, and exits 5; the next slot retries what is still due. If brain cannot answer, the run goes ahead with a `WARN:` line.
   - **Quality gate** (`render/validate.mjs --date <today>`): if today's captions carry an untagged, off-site or Vercel link (or break another SEO rule), nothing of today's is published: one `NEEDS-YOU:` line, exit 7; the next slot retries.
   - The day's cards and video are rendered if missing; a video made before the current recipe (template, card text, music) is rendered again. A card or video that fails the **brand check** (logo, clear space, contrast, black and silver pixels) or the **audio check** (10 s, −14 LUFS, true peak, music audible) is never written: the renderers exit 5 and the run holds what would show it with one `NEEDS-YOU:` line (exit 6). Any other render error holds them the same way, and an old video is deleted before it is re-rendered, so nothing stale or silent can slip through; only a text-overflow warning (exit 3) lets them through.
   - **Screenshot guard** (`render/shot-guard.mjs`): a `product` card's live screenshot (`card.shot`) is refused, never recorded, when its URL or redirect is on Vercel (`vercel.app`, `now.sh`: Vercel is banned since 2026-11-27), the page answers an HTTP error, or it shows a paused, suspended or error page or next to no text. The renderers then exit 4 with a `SHOT REFUSED:` line, and the run holds whatever would show that screenshot (feed posts if the cards could not be rendered, otherwise the videos and stories), logs one `NEEDS-YOU:` line and exits 6; the next slot retries. `validate.mjs` also rejects any `vercel.app` URL in a day, so a top-up draft carrying one is never merged.
3. A Claude session on the **ceo seat** (`CLAUDE_CONFIG_DIR=~/.claude-brain/profiles/ceo`, so Claude in Chrome drives Chrome "Profile 2", Devya) publishes them, following `routine/publish-worker.md`. It may only use the Chrome tools; no files, no shell, no git.
4. `routine/record.mjs` writes the result to `state.json`, `log.md` and `proof/`, and the launcher commits and pushes only those files to `main`.
5. Once a day, if fewer than 7 days are left after today, a top-up session drafts the next days (`routine/topup-worker.md`) into `inbox/new-days.json`; `routine/merge-days.mjs` validates, renders and merges them, or rejects the whole draft. New days land a week before they publish.

Full transcript of every run: `~/Library/Logs/devya-social-daily.log`. Brain's Routines tab lists it as "Devya Social Daily".

If a network shows a login, 2FA or verification screen, the routine stops that network, logs it as `blocked` with a `NEEDS-YOU` line, and carries on with the others.

If the publish session stops on a usage-limit banner, the transcript gets a `LIMIT:` line. A cap on the seat's model alone ("Switch to another model") is retried once at once with `--model sonnet` (`DEVYA_SOCIAL_FALLBACK_MODEL` overrides); a cap on the seat itself waits for the first slot after the reset.

Tests for the routine's helpers, the screenshot guard, links/SEO, the music mix and the logo/theme checks: `node --test social/routine/*.test.mjs social/render/*.test.mjs` (needs ffmpeg and Playwright's cached Chromium). The repo's full local CI: `scripts/ci-local.sh`.

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
- Links in a caption must carry `utm_source=<network>&utm_medium=social&utm_campaign=<post slug>`, where the slug is `<date>-<topic words>` (`render/seo.mjs` `campaignSlug`/`tagUrl`); `validate.mjs` names the exact slug it expects. Top-up drafts may carry plain links: `merge-days.mjs` tags them.
- Hold a channel on every day (for example `instagram_story`): add it to `pausedChannels` in `calendar.json` with the reason; delete the key to switch it back on.
- Drop a day: set `"skip": true` on it. The slot stays empty and is logged; nothing is back-filled.
- First run in a fresh checkout: `cd social/render && pnpm install` (uses Playwright's cached Chromium).

## Brand, music and links

- **Logo** (`brand/devya-wordmark.svg`): the site header's wordmark, embedded byte for byte at 200 px (landscape cards), 280 px (portrait cards), 330 px and 620 px (video). `render/brand-check.mjs` fails a card or video frame if the logo is not that file, is stretched, cropped, filtered, faded, under 150 px, has anything within one logo height of it, or sits on a background with less than 7:1 contrast.
- **Theme**: black (`ink-900` `#08090a`) with silver/grey accents, all taken from the site's tokens (`render/brand.mjs`). A template that names any other colour, or a render whose pixels show a hue, fails the brand check. Product screenshots are shown in greyscale. The old per-pillar ember/azure/lime accents are retired (days before 2026-11-28 keep their published `accent` field as history).
- **Music** (`render/audio.mjs`, `music/`): every video gets a CC0 bed picked by date (three tracks, two windows each), faded in (1 s) and out (1.5 s), mixed to −14 LUFS integrated with true peak ≤ −1 dBTP. With a narration file (`visuals/<date>/voice-<lang>.wav|mp3|m4a`, optional `.srt` script), the bed is ducked to −20 LUFS under speech (tested to stay within −18 to −22). Only files in `music/tracks.json` with a matching SHA-256 are played; licences in `music/LICENSES.md`.
- **Links and SEO** (`render/seo.mjs`, enforced by `validate.mjs` for every day from 2026-11-28): links only to the day's page on www.devya.dev, `/contact`, the product shown (`*.devya.dev`), or the day's `video` (a Devya-channel YouTube video listed in `videos.json`, as `https://www.youtube.com/watch?v=<id>`; `--live` checks it through YouTube's oEmbed: playable and on Devya's channel), never Vercel, never a redirecting URL (`validate.mjs --live`), always tagged `utm_source`/`utm_medium=social`/`utm_campaign=<post slug>` (+ `utm_content=reel` on the Facebook Reel). Each day lists `keywords` (EN + AR) and every caption's first line and both reel hooks lead with one. Hashtags: LinkedIn 3–5, Facebook 1–3, Instagram 3–5 (Instagram's cap is 5), always including `#BuildWithDevya`. "Devya" is always written that way (never ديفيا or "Devya Solutions" in copy), products as devya.dev names them. Images get alt text (`seo.altText`, passed to the publisher in `due.json`); videos get burned-in on-screen text plus an `.srt` subtitle file, uploaded on LinkedIn where the composer takes one.

## Auditing posts

`node social/render/audit.mjs [--render]` checks every published post (`state.json`) and every scheduled day against the standard above and writes `social/audit/<date>.json` (machine-readable) and `.md` (report). For each published post that falls short it gives the exact corrected caption (verified by the same link and hashtag rules), whether the platform can apply it in place, and the replacement media (`--render` writes replacement cards to `social/audit/media/` and re-renders the videos with music). Media that a platform cannot replace in place (LinkedIn and Instagram images and videos, Facebook photos) is listed as "repost needed" with a recommendation; nothing is ever deleted by the pipeline. In-place edits happen in the ceo seat's Chrome (Profile 2), which holds the Devya accounts.
