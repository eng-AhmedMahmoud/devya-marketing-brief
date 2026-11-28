# Devya on YouTube: a daily, profit-first content plan

Channel: Devya Solutions (`@DevyaSolutions`, `UCr3NVqdbc_31pUVYSJSVUmQ`). Written 2026-11-28.
Starting point: 3 public videos (Founders Live pitches for Moving POS AI, Moving Stores and Moving Loyalty), 28 views in 28 days, 0 subscribers.

The pipeline that makes the videos is `social/youtube/` (see its README). This file is the editorial plan: what we publish, when, for whom, and how it pays.

## 1. How the channel makes money

YouTube ad revenue comes last and is small for Arabic tech content. The channel pays through the three things Devya already sells. Every video points at one of them.

| Stream | Who it reaches | The ask in the video and description | What we measure |
|---|---|---|---|
| **Products**: Moving POS (199 EGP per branch per month on devya.dev), Moving Loyalty, Moving Stores | Restaurant, café and retail owners in Egypt and the Gulf | The product's own link (`social/projects.json`), "book a demo" on devya.dev | UTM clicks to the product (GA4, `utm_source=youtube`), demo requests |
| **Builds and reviews**: custom web/mobile/AI work, Devya X-Ray code reviews | Founders and product owners; CTOs of small teams | `www.devya.dev/contact`, X-Ray link on engineering videos | Contact-form leads tagged `utm_campaign=yt-…`, calls booked |
| **YouTube Partner Program** | Everyone | Subscribe, end screen to the next video | Subscribers, public watch hours, Shorts views |

YPP thresholds to plan against: **1,000 subscribers plus 4,000 public watch hours in 12 months, or 1,000 subscribers plus 10M public Shorts views in 90 days**. YouTube also runs a lower fan-funding tier (memberships, Super Thanks) at 500 subscribers in some countries; check Studio → Earn for Egypt.

**4,000 watch hours in practice**: an 8–9 minute video watched for about 3 minutes on average needs about 80,000 long-form views in a year. At 2 long-form videos a week that is about 800 views per video. Treat that as the year-one target, not a forecast.

**Lead maths**: one restaurant chain on Moving POS (10 branches × 199 EGP) brings in 1,990 EGP a month, and one custom build brings in more than a year of the voice plan. So the business goal for the first 90 days is **2 qualified leads a month** from YouTube. Subscribers are a means to that.

## 2. Format and cadence: one upload every day

| Slot (Cairo) | What | How many | Where it comes from |
|---|---|---|---|
| **19:00 daily** (20:00 KSA, the evening peak in both markets) | One upload | 7 a week | Long-form on its days, a Short on the others |
| Long-form | 8–10 min tutorial, explainer or build-along | 2 a week once the backlog runs (Sun and Wed) | A new script narrated in the cloned voice |
| Shorts | 35–58 s, vertical, burned-in captions, one idea | 3 cut from each long-form | Beats of the long-form written to stand alone. No new narration, so no voice credits |

Why this shape: the **voice credits set the pace**, not the editing.

- The Devya ElevenLabs account (Creator, 131,000 credits a month) is shared with the Catalyst lessons.
- The first three long-forms took 18,668 characters, retakes included. The account's usage went from 89,897 to 102,617 credits while they were made, about 0.7 credits per character.
- That leaves **28,383 credits until the reset on 2026-12-21**, 5,000 of them kept in reserve.
- A 9-minute long-form costs about 4,500 credits, so about **5 more long-forms fit before the reset**. From then on, up to about 25 a month fit, if Catalyst uses little.
- Shorts cut from the long-forms cost nothing extra, and they fill the days between.
- A long-form every day would need about 135,000 credits a month, more than the plan holds. That is a paid upgrade and the developer's call.

**Language**: Egyptian Arabic narration with English technical terms. That is the language the developer's professional voice clone was trained on, and how he teaches. Titles lead with the search term people type, often the English product name (`Claude Code`, `POS`). Descriptions are in Arabic with an English summary line. Captions (SRT) ship with every video.

## 3. Series (playlists)

| Playlist | Audience | Why it pays | Demand signal (YouTube autocomplete, 2026-11-28) |
|---|---|---|---|
| **Claude Code بالعربي**: AI coding workflows | Developers and tech leads | Authority and subscribers. X-Ray and build leads from tech leads | "شرح claude code", "شرح كلود كود من الصفر", "claude code بالعربي", "claude code tutorial arabic" |
| **Retail tech بالعربي**: POS, loyalty, e-invoicing, inventory | Restaurant, café and retail owners | Direct product leads (Moving POS, Loyalty, Stores) | "برنامج كاشير مطعم", "نظام كاشير pos", "نظام نقاط البيع pos", "ربط الفاتورة الالكترونية مع الزكاة والدخل" |
| **Ship it yourself**: VPS, Docker, HTTPS, CI without Vercel | Developers, small agencies | Build and hosting work, subscribers | "docker بالعربي", "coolify شرح", "deploy nextjs on vps" |
| **AI في البيزنس**: AI agents, n8n, AI in retail | Owners and developers | Both audiences; AI POS assistant demos | "شرح n8n من الصفر", "شرح n8n ai agents", "ai in retail store" |
| **System design بالعربي**: architecture of real products | Mid and senior developers | Authority, long watch time | "system design بالعربي", "frontend system design بالعربي" |

## 4. The backlog (in order)

Each entry lists: the SEO title (Arabic, keyword first), the hook (the first 10 seconds), the outline, the length, the 3 Shorts, the keywords, and the link that pays.

### Approved for production now (the first 3)

**1. Claude Code بالعربي: workflow حقيقي من issue لـ Pull Request** · 8–9 min · Claude Code بالعربي
- Hook: we run every change at Devya through this one workflow, and the agent writes the code. Its use is not the typing; it is that every step can be checked.
- Outline:
  1. What Claude Code is: an agent in the terminal that reads the repo and runs commands.
  2. Install and first run.
  3. `CLAUDE.md` as project memory (`/init`).
  4. Plan mode before any code.
  5. A small task with a test first.
  6. Reading the diff.
  7. Commit and PR with `gh`.
  8. Guardrails: permissions, hooks (the secret-scan pre-commit), the CI gate: never merge on red.
  9. The four mistakes.
  10. Recap.
- Shorts: "Plan mode before the first line", "CLAUDE.md is your project's memory", "4 mistakes people make with Claude Code".
- Keywords: شرح Claude Code, Claude Code بالعربي, كلود كود, AI coding agent, Pull Request.
- Pays: Devya X-Ray (`https://xray.devya.dev/en`) and devya.dev.

**2. برنامج كاشير للمطاعم والكافيهات: 7 أسئلة قبل ما تشتري** · 8–9 min · Retail tech بالعربي
- Hook: most owners pick a POS from a ten-minute demo, and find the problem a month later, at stock count.
- Outline:
  1. The POS as the restaurant's nervous system.
  2. Seven questions: when the internet drops; the kitchen screen; recipes and real food cost; branches and one menu; online orders without handing 25% to an aggregator; loyalty; the pricing model (per terminal and per module vs per branch).
  3. A real deployment: Moving POS at a 25-branch drinks chain, 679 items and sizes, order to kitchen in under a second, 199 EGP per branch per month (devya.dev/projects/devyapos).
  4. Checklist recap.
- Shorts: "Ask this before you buy a POS: what happens when the internet drops?", "Your real food cost is in the recipe", "Don't pay per device".
- Keywords: برنامج كاشير, نظام كاشير مطاعم, نظام نقاط البيع POS, برنامج كاشير كافيه.
- Pays: Moving POS (`https://pos.movingsystems.tech`) and devya.dev.

**3. رفع مشروع Next.js على VPS بنفسك: Docker و HTTPS من غير Vercel** · 8–9 min · Ship it yourself
- Hook: one of our sites went dark behind "This deployment is temporarily paused". Since that day everything we ship runs on servers we control.
- Outline:
  1. Why a VPS: a predictable bill, nobody can pause it, data where your clients need it.
  2. What you need: 2 vCPU / 4 GB, a domain on Cloudflare.
  3. `output: 'standalone'` and a multi-stage Dockerfile.
  4. Compose with a health check.
  5. Caddy for automatic HTTPS in two lines.
  6. Updates: build, ship, restart, roll back.
  7. Hardening on day one: SSH keys, no root login, firewall, backups.
  8. Recap.
- Shorts: "A Next.js Dockerfile in 40 seconds", "HTTPS in two lines with Caddy", "3 things to do the minute you get a server".
- Keywords: رفع موقع Next.js على VPS, Docker بالعربي, deploy Next.js VPS, من غير Vercel.
- Pays: devya.dev (`/solutions`, `/contact`).

### Next (the developer picks the order; 2 a week)

| # | SEO title | Hook | Outline | Shorts | Keywords | Pays |
|---|---|---|---|---|---|---|
| 4 | ربط الفاتورة الإلكترونية مع الزكاة والدخل (ZATCA المرحلة التانية) للمطورين | "The invoice passed our validator and was still rejected: here is why" | Phase 2 in one picture; CSID onboarding; the signed XML and its hash chain; the QR; clearance vs reporting; the validator's quirks; a checklist | Phase 1 vs 2 in 40 s; why invoices get rejected; what the QR carries | ربط الفاتورة الالكترونية مع الزكاة والدخل, ZATCA, فاتورة إلكترونية | Moving POS (Saudi readiness), builds |
| 5 | شرح n8n من الصفر: أول AI agent يرد على طلبات العملاء | "This agent answered 40 customer messages while we slept" | n8n vs Zapier; self-host; webhook → AI agent → tools; guardrails; costs | Self-host n8n; an agent's tools; when not to use an agent | شرح n8n, n8n ai agents, AI agent بالعربي | Builds |
| 6 | برنامج ولاء العملاء: إزاي ترجّع الزبون تاني (stamps ولا points ولا tiers؟) | "A loyalty card in Apple Wallet gets opened 5× more than an app" (only with a sourced figure) | Stamps vs points vs tiers; wallet passes; fraud; measuring return rate | Stamps or points?; wallet cards; the one loyalty metric | نظام ولاء العملاء, برنامج نقاط, Apple Wallet | Moving Loyalty |
| 7 | Claude Code hooks و subagents: خلّي الـ agent يمشي على قواعدك | "The agent tried to commit a key, and the hook stopped it" | Hooks lifecycle; a pre-commit secret scan; subagents for review; settings | A hook in 30 s; subagent review; permissions | Claude Code hooks, subagents | X-Ray, builds |
| 8 | System design لنظام كاشير: إزاي الطلب يوصل المطبخ في أقل من ثانية | "679 items, 25 branches, one database" | Order flow; Socket.IO KDS; stock deduction; offline sync; reports | WebSocket vs polling; recipe deduction; offline queue | system design بالعربي, POS architecture | Moving POS, builds |
| 9 | CI/CD بنفسك: Jenkins على VPS بدل GitHub Actions | "Our PRs merge only when a server we own says green" | Jenkins on a VPS; PR checks; local CI fallback; secrets | PR gate in 40 s; local CI; never merge on red | CI/CD بالعربي, Jenkins, GitHub | Builds |
| 10 | الذكاء الاصطناعي في المحلات: 5 استخدامات بتجيب فلوس فعلًا | "AI that doesn't move a sale or a cost is a toy" | Demand forecast; menu engineering; AI assistant on the POS; review replies; fraud | Each use as a Short | الذكاء الاصطناعي في المبيعات, AI in retail | Moving POS AI |
| 11 | موقع طلبات أونلاين لمطعمك من غير عمولة الـ aggregators | "25% of every delivery order goes to an app" | Own ordering site; menu sync with POS; delivery zones; payments | Commission maths; zones; one menu | موقع طلبات مطعم, طلب أونلاين | Moving Stores |
| 12 | Claude Code + MCP: وصّل الـ agent بالـ browser والـ database | "The agent opened the browser and checked its own fix" | MCP in one picture; adding a server; browser testing; safety | What MCP is; a browser check; permission prompts | Claude Code MCP, MCP بالعربي | Builds |

Ideas that need a source before they are scripted (no claim goes on screen without one): wallet-pass open rates, aggregator commission figures by market, ZATCA rejection causes from live logs.

## 5. Calendar (first two weeks; all at 19:00 Cairo)

| Date | Upload |
|---|---|
| Sat 28 Nov | 1 Claude Code (long) |
| Sun 29 Nov | Short 1a: Plan mode |
| Mon 30 Nov | 2 POS buyer's guide (long) |
| Tue 1 Dec | Short 2a: internet drops |
| Wed 2 Dec | Short 1b: CLAUDE.md |
| Thu 3 Dec | 3 VPS without Vercel (long) |
| Fri 4 Dec | Short 3a: Dockerfile |
| Sat 5 Dec | Short 2b: real food cost |
| Sun 6 Dec | Short 1c: 4 mistakes |
| Mon 7 Dec | Short 3b: Caddy HTTPS |
| Tue 8 Dec | Short 2c: don't pay per device |
| Wed 9 Dec | Short 3c: server day one |
| From Thu 10 Dec | Long-forms 4 to 8 (credits allow about 5 before the 21 Dec reset), then Sun and Wed weekly, Shorts on the other days |

Every upload is staged in YouTube Studio as **Private**. Nothing is public, unlisted or scheduled until the developer approves it (2026-11-28). The dates above are the proposed go-live slots.

Once a video is approved, setting it to Scheduled at its slot (visibility → Schedule, 19:00 GMT+2) means no day depends on a session running at 19:00.

YouTube took 10 uploads on 2026-11-28 and then refused more ("Daily upload limit reached"). The last two Shorts go up after the 24-hour reset, or right away once the channel completes YouTube's one-time verification.

## 6. Packaging rules (enforced by `social/youtube/youtube.mjs` and `social/render/validate.mjs`)

- **Title**: 100 characters at most, and the first 60 carry the keyword. Arabic, with the term people search in Latin script where that is how they type it.
- **Description**: the first two lines are the hook and the keyword. Then the paying link, the devya.dev link, chapters and hashtags (3 at most; YouTube shows the first three above the title).
  - Every description carries a **devya.dev link**, plus the **project's own link** when the video is about a project (`social/projects.json`).
  - Both are tagged `utm_source=youtube&utm_medium=video&utm_campaign=yt-<slug>&utm_content=long|short`. No Vercel, no redirects.
- **Chapters**: start at 0:00. At least 3 chapters, each 10 s or longer, taken from the script's slide starts.
- **Tags**: about 8–15, 500 characters at most. Arabic and English spellings of the keyword.
- **Thumbnail**: 1280×720, in the black and silver theme, with the official wordmark. 3–5 words, readable at phone size, never the title repeated word for word.
- **Captions**: SRT from the narration's own timings, uploaded as Arabic.
- **Pinned comment**: the paying link and one question to answer (the comment ranks the video).
- **End screen**: the last 12 seconds hold no speech and show only the wordmark. End-screen elements (subscribe, next video) go there.
- **Shorts**: under 60 s, vertical, burned-in captions, with a keyword on screen in the first second. The description links the full video.

## 7. Production (per long-form, about 2 hours of machine time)

Script (beats + slides, `social/youtube/scripts/<slug>.json`) → narration in the cloned voice (ElevenLabs PVC on the Devya account, quota checked first) → word check (Whisper against the script) and tone check (pitch and brightness of every take) → retakes → slides rendered in the theme with Playwright, brand-checked → assembly (music bed ducked under the voice, −14 LUFS) → SRT, chapters, thumbnail → **review gate** (`node social/youtube/produce.mjs gate <slug>`) → upload to Studio as Private; the developer approves going live.

## 8. What we measure, and when we change course

Weekly (Sunday), from YouTube Studio plus GA4:

- **Long-form**: impressions CTR (target 4%+), average view duration (35%+), and views from search vs browse.
- **Shorts**: viewed vs swiped away (70%+), and subscribers per Short.
- **Money**: UTM sessions from YouTube to devya.dev and the products, then contact-form leads and demo requests from them.

| Day | Decision rule |
|---|---|
| 30 | Keep the two playlists with the best views per video and leads per video. Drop the weakest. |
| 60 | If Shorts bring subscribers but long-form CTR is under 3%, rework thumbnails and titles before adding volume. |
| 90 | If YouTube has brought no lead, move the mix toward the Retail tech series (buyer intent) and away from the developer series. |

## 9. Decisions for the developer

1. **Approve going live.** The 10 uploads sit as Private drafts in Studio (links in `social/youtube/episodes.json`). Approve each, or the calendar as a whole.
2. **Complete YouTube's one-time channel verification** (Studio → Settings → Channel → Feature eligibility). It makes description links clickable, lets a Short link its full video ("Related video"), and lifts the daily upload limit. It needs the owner's phone or ID, so only the developer can do it.
3. **Approve or reorder the backlog.** Items 1–3 are made. Pick the order of 4–12; about 5 fit before 21 Dec.
4. **Voice credits.** Decide whether the Devya ElevenLabs account is reserved for the channel or shared with Catalyst lessons. Upgrade the plan only if you want a long-form more than twice a week.
5. **On-camera presence.** Decide whether a face cam in the intro (10 s, recorded once) is worth adding. Channels with a face usually convert better for services.
6. **Comment replies.** Replies are drafted by a routine like the dev.to one, and you approve them.
