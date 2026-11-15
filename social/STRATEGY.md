# Devya social: content strategy

Daily organic presence on Devya's own **Instagram**, **Facebook** and **LinkedIn** company page.
Every day: one feed post per network, plus one 10-second vertical video used as a **Facebook Reel**, an **Instagram Reel**, a **LinkedIn native video**, and a **Facebook and Instagram Story** (added 2026-11-15 at the developer's request). Written 2026-11-15, revised the same day after an advisor pressure-test (summary at the end).

Inputs: brand canon, strategy roadmap and parked decisions (this site's `/brand`, `/strategy`, `/decisions`),
the public site and blog at https://www.devya.dev, and the latest `devya-market-intel` competitor report
(`~/.config/routines-dashboard/reports/competitors/latest.json`, 2026-11-15).

## Where we start (2026-11-15)

| Network | Account | Followers | Last post | Notes |
|---|---|---|---|---|
| LinkedIn | Devya Software Solutions, `linkedin.com/company/103174555` | 48 | 2026-11-05 | The brief's old slug `/company/devya-solutions` now 404s. Older posts lean on unverifiable numbers. |
| Facebook | Devya Solutions, `facebook.com/devyasoftware` | 11K | 2026-07-17 | Biggest audience, quiet for four months. English so far. |
| Instagram | `@devyasoftware` | 606 | 7 posts | Reels-heavy grid, no feed cadence yet. |

The founder's personal LinkedIn (18K) is the real B2B reach. This plan covers the company page only. Resharing from the founder profile is a decision for the developer (see `DECISIONS` below).

## Audience

1. **MENA founders and product owners** who need a web app, mobile app, internal tool or AI feature built, mainly Egypt and the Gulf (Saudi first). They hire on trust: proof of work, clear process, honest pricing.
2. **CTOs and engineering leads** who look for a delivery partner or a second team. They judge by technical judgement, not adjectives.
3. **Engineers and designers** in Egypt who might join or refer (secondary; hiring posts and engineering posts serve them).

What the competitor intel says these buyers are burned by: oversold capacity, silent schedule slips, engineers swapped without handover, fees that outlast the service, quotes given before anyone understood the users. What they reward: a costed v1 cut line, weekly honest updates, a named team, Arabic-first products, local payment options. Our client-value posts answer those fears directly, as advice a buyer can use with any vendor.

## Pillars

| Pillar | Share | Source of truth | Example |
|---|---|---|---|
| **Client value and process** | ~30% | Buyer questions from the competitor intel, phrased as advice for any vendor | "Ask for a cut line before you ask for a quote" |
| **Engineering insight** | ~25% | Devya blog "field notes" on devya.dev/blogs | "N+1 queries hide in dev and multiply in prod" |
| **Product launches** | ~20% | Devya's own products on devya.dev/projects | X-Ray, CopyForge, ShotCraft, PlaceHarvest, AdGap |
| **Behind the scenes and culture** | ~15% | How we actually work, our open-source tools, open roles | The three guardrails we run on every repo |
| **Case studies (own builds)** | ~10% | Devya-built public projects only | Arabic Business Resources, Urania |

Two-week rhythm: client value early in the work week, engineering mid-week, at most two product posts in any five days, culture and lighter posts on Egypt's weekend (Friday, Saturday). Hiring posts at most once every two weeks.

**Case studies use Devya's own builds only.** Client projects appear only if the project is already public on devya.dev, and even then without metrics we cannot show. The 14-day calendar uses none.

## Tone per network

| Network | Voice | Length | Shape |
|---|---|---|---|
| **LinkedIn** | Professional, insight-led, founder-to-founder. One clear opinion per post, backed by how we do it. | 120–220 words | Hook line, 3–5 short paragraphs or a short list, one takeaway, link at the end. |
| **Instagram** | Visual and short. The image carries the idea; the caption adds one useful line. | 40–90 words | Hook, 2–3 lines, "link in bio", hashtags at the end. |
| **Facebook** | Community, plain language. Talk to business owners, not engineers. | 60–140 words | Plain explanation, a practical tip, link. |

Voice rules from the canon apply everywhere: specific over generic, no "passionate / innovative / best-in-class", no hedging, show the work.

## Language

The canon decides: **bilingual delivery, separate captions, never one caption with both languages.** With one post per network per day:

- **LinkedIn: English every day.** B2B buyers and CTOs, Gulf and international.
- **Facebook: Arabic by default** (Sun, Mon, Wed, Thu, Fri), English on **Tue and Sat** as a control. The 11K page is mostly Egyptian; four months of English-only got little engagement.
- **Instagram: English by default**, Arabic on **Tue and Sat**. Fixed weekdays, not strict alternation, so followers learn the rhythm and every day still ships both languages across Meta.
- **Arabic is Modern Standard Arabic (فصحى)**, never Egyptian colloquial, kept short and plain so it doesn't read stiff. Product and tool names stay in Latin script. The image text matches the caption language.

## Visuals

Every post ships with a branded graphic rendered from HTML/CSS by Playwright (`social/render/`), in the canon: ink background, Sora (Latin) and Cairo (Arabic) type, JetBrains Mono for code, one accent per pillar (ember: client value and culture; azure: engineering; lime: product, case studies and BTS), `</>DEVYA` mark, `devya.dev` footer.

Six layouts rotate so the grid never reads as one template: **statement** (one big line), **checklist** (numbered steps, optional "cut line"), **code** (real code in JetBrains Mono), **terminal** (command output), **compare** (two columns, before/after), **product** (a live Playwright screenshot of the product's page on devya.dev in a frame). No layout more than twice a week.

| Network | Size | Ratio |
|---|---|---|
| Instagram | 1080 × 1350 | 4:5 portrait (most feed space) |
| Facebook | 1080 × 1350 | 4:5 portrait |
| LinkedIn | 1200 × 627 | 1.91:1 landscape, headline at least 44px so it survives a phone screen |

No stock photos, no AI-generated imagery, no client logos or screenshots of client work.

## Reels, Stories and LinkedIn video

- **One vertical video a day**, 1080×1920, 10 s, 30 fps, H.264 with a silent track (no licensed music). It is the day's card, animated: the mark and kicker fade in, the title rises word by word, the checklist / code / terminal / comparison / product screenshot builds line by line, then a two-second end card (`</>DEVYA`, `devya.dev`, `@devyasoftware`). Rendered by `render/render-reel.mjs` in English and Arabic; all text sits inside the Reels/Stories safe area.
- **Language follows the day's feed**: the Facebook Reel and Story use Facebook's language that day, the Instagram Reel and Story use Instagram's, the LinkedIn video is English.
- **Captions**: one authored hook per day (`reel.en` / `reel.ar` in the calendar). Reel captions are that hook plus 3–5 hashtags on Instagram, plus a tracked link (`utm_content=reel`) on Facebook, plus 3 hashtags on LinkedIn. Stories carry no caption.
- **Why the same video everywhere**: Stories exist to push followers to the day's Reel and post; reusing the video keeps the daily cost at one render, and every network still sees it once.
- **Instagram Stories are held** until the developer accepts the Devya Solutions business-portfolio terms in Meta Business Suite: Instagram's desktop site has no story composer, and Business Suite (which has one) asks for that acceptance first. The calendar's `pausedChannels` holds the channel; deleting the key switches it on.

## Hashtags

- **LinkedIn**: 3–4 per post, one brand tag plus topic tags. Brand: `#BuildWithDevya`. Topic examples: `#SoftwareEngineering #NextJS #NodeJS #PostgreSQL #ProductDevelopment #MENA #Egypt #SaudiArabia`.
- **Instagram**: 5–8 at the end of the caption, rotated so no set repeats two days running. EN: `#BuildWithDevya #SoftwareDevelopment #WebDevelopment #Cairo #Egypt #MENA #Startups #TechTips`. AR: `#برمجة #تطوير_البرمجيات #تطوير_المواقع #ريادة_الأعمال #مصر #السعودية #تقنية`.
- **Facebook**: none. Hashtags do little there.

## Posting times (Cairo, EET, UTC+2; Saudi is +1h)

Egypt's work week is Sunday–Thursday; Friday and Saturday are the weekend. Gulf buyers sit one hour ahead.

| Channel | Time | Notes |
|---|---|---|
| LinkedIn post | **10:00** (11:00 KSA, start of the work day) | Fri/Sat get the lightest posts (culture, case studies); reach there is low in Egypt and the Gulf. |
| LinkedIn video, Facebook Reel, Instagram Reel | **13:00** | Lunch-break scroll; the video teases the evening posts. |
| Facebook post + Story | **19:30** | Evening scroll peak. |
| Instagram post + Story | **21:00** | Spaced from Facebook so no follower gets both within minutes. |

The daily routine runs at **10:00, 13:00, 19:30 and 21:00**. Each run publishes every network whose slot has passed and that has not been published today, so a missed run is caught by the next one. Ramadan shifts all of this later; revisit before it.

## Links and tracking

- Every link points at `https://www.devya.dev/...` and carries `?utm_source=<network>&utm_medium=social` (`linkedin`, `facebook`, `instagram`). GA4 reads UTM natively; the roadmap's older `?ref=social-<platform>` tag would need a custom dimension, so UTM replaces it.
- Instagram captions say "link in bio". The bio links `www.devya.dev` without UTM; changing it is a profile edit, so it is left to the developer.
- LinkedIn puts the link at the end of the post, never in the first line. Roughly half the LinkedIn posts carry no link at all, to test the reach cost of external links.

## Quality gate (every post, including routine top-ups)

The canon bans auto-generated filler. What keeps this from being that:

1. **Grounded.** Every post is built on one real source: a Devya blog post, a product page on devya.dev, an open role, or a practice Devya actually follows. The source URL is stored with the day.
2. **One concrete thing.** Each post names a tool, a command, a step or a check. If a draft can't, it is cut.
3. **No repeats.** No topic or hook repeats within 14 days; no two of the last five posts open the same way. The three networks' posts on one day share a topic but are written separately, never one caption reworded.
4. **Claims checked.** Nothing is called launched or available unless devya.dev shows it. No prices or timelines that differ from the site. Buyer advice says "ask your vendor for…", never "agencies do…", never names or hints at a competitor, never turns intel into a statistic.
5. **Human window.** The calendar sits in git at least six days ahead of publishing. The developer can edit any day or mark it `"skip": true`; a skipped slot is a valid, logged outcome, never back-filled with filler.
6. **Validator.** `social/render/validate.mjs` rejects a calendar with banned strings (`devya.solutions`, `devya.com`, Driftcode), missing UTM on devya.dev links, hashtag counts out of range, captions over network limits, or a layout used more than twice in seven days.

## Hard rules (the routine enforces these)

- Post only on Devya's own three accounts. No DMs, no replies, no comments, no follows or connection requests, no tagging people or clients.
- No ads, boosts or anything that costs money. Dismiss every "Boost" prompt.
- No client names, logos or project details unless already public on devya.dev. No invented metrics, testimonials, client counts or growth numbers.
- Never change account settings, passwords, page info, bios or covers.
- Never mention Driftcode (locked off by the founder). Never use `devya.solutions` or `devya.com`; the domain is `devya.dev`. Email is `contact@devya.dev`.
- If a network asks for a login, 2FA or any verification: stop that network, log it, carry on with the others.

## Measurement

- The routine logs every post URL to `social/log.md` and `social/state.json`.
- Per post, logged at 48h where the network shows it: network, language, pillar, layout, time, impressions/reach, reactions, comments, shares/saves, link clicks, follower delta.
- Weekly: GA4 sessions with `utm_medium=social`, and enquiries in admin that came from social.
- Day 14 (2026-11-28) is **directional only**: seven posts per language per page at this follower count is mostly noise. Change course only on a clear gap (2× or more) that holds for two weeks; otherwise extend the test to 28 days.
- The roadmap's week-4 gate (LinkedIn engagement > 2× Instagram) is meaningless at 48 followers; compare engagement per post with a minimum-impressions floor instead.

**This plan overrides two roadmap items**: the cadence target "FB+IG 3×/week, LinkedIn 2×/week" (now daily on all three, per the developer's request) and the `?ref=` tag (now UTM).

## Advisor pressure-test (2026-11-15)

An independent reviewer challenged the first draft. What changed because of it:

| Challenge | Change |
|---|---|
| Strict EN/AR alternation makes each Meta feed bounce between languages | Facebook Arabic-first, Instagram English-first, swap only on Tue and Sat |
| A feed of identical text cards reads as template spam by day 10 | Six rotating layouts, real code/terminal renders, live product screenshots, max two uses per layout per week |
| Daily posting drifts into filler | Quality gate, dedupe, validator, and a logged "skip" instead of filler |
| Buyers hire on process, not engineering trivia | Client value up to ~30%, engineering down to ~25%, hiring folded into BTS |
| FB 20:00 and IG 20:30 hit the same people minutes apart | FB 19:30, IG 21:00 |
| `ref` param is invisible to GA4 | UTM instead |
| Day-14 comparison is noise at this scale | Treated as directional; 2× gap held two weeks before acting |
| Competitor intel could leak into posts as claims | Advice phrased for any vendor; no competitor names, no intel statistics |

Raised but not adopted, left for the developer: a "what a build costs / how long it takes" series with price and timeline ranges (needs ranges the developer signs off), and fewer LinkedIn weekend posts (the brief asks for daily).
