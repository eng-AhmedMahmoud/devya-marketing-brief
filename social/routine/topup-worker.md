# Devya daily social: calendar top-up worker

The social calendar (`social/calendar.json`) has fewer than 7 days left. Draft the next days and write them to `social/inbox/new-days.json`. The launcher then validates, renders the visuals and merges them; if validation fails it sends you the errors once to fix.

You may read any file and fetch pages from `www.devya.dev`. You may write only `social/inbox/new-days.json`. No shell, no git, no other files, no posting.

## Read first

1. `social/STRATEGY.md`: audience, pillars and shares, tone per network, language rule, hashtags, links, the quality gate. Follow it exactly.
2. `social/calendar.json`: the schema, and every topic already used. Copy the shape of existing days exactly (fields, layouts, card text for `en` and `ar`, captions per network).
3. The newest competitor intel: `~/.config/routines-dashboard/reports/competitors/latest.json` (`guide.do`, `guide.avoid`, `opportunities`). Use it only to choose **buyer-advice** topics. Never name or hint at a competitor, never quote a review, never turn intel into a statistic. Phrase it as "ask your vendor for…".
4. Sources of facts, fetched live: the blog index `https://www.devya.dev/blogs` and its posts, `https://www.devya.dev/projects` and Devya's own product pages, `https://www.devya.dev/services`. Use only facts these pages state.

## What to write

`social/inbox/new-days.json` = `{"days":[ ... ]}` with exactly the number of days the user message asks for, dated consecutively starting the day after the calendar's last date. Each day:

```jsonc
{
  "date": "YYYY-MM-DD",
  "pillar": "client-value | engineering | product | bts | case-study | culture",
  "layout": "statement | checklist | code | terminal | compare | product",
  "accent": "ember (client-value, culture) | azure (engineering) | lime (product, case-study, bts)",
  "topic": "one line, unique",
  "source": "https://www.devya.dev/... (the page the facts come from)",
  "basis": "where the idea comes from (blog post, product page, intel item)",
  "linkedinLink": true,              // about half the days true, half false
  "card": { "en": {...}, "ar": {...}, /* plus code | terminal | cut | shot/shotLabel as the layout needs */ },
  "posts": {
    "linkedin":  { "lang": "en", "caption": "..." },
    "facebook":  { "lang": "ar | en", "caption": "..." },
    "instagram": { "lang": "en | ar", "caption": "..." }
  }
}
```

Card fields by layout (look at existing days for real examples):
- all: `kicker`, `title` (wrap one or two accent words in `*asterisks*`), optional `sub`
- `checklist`: `items` (3–6 short lines, no `sub`), optional top-level `cut` (index where the v1 line goes)
- `code`: top-level `code: [{label:{en,ar}, code}]`, at most ~12 code lines in total
- `terminal`: top-level `terminal: ["$ command", "output", "✓ ok line", "✗ error line"]`, 4–7 lines
- `compare`: `left:{label,items}`, `right:{label,items}`, 4 short items each
- `product`: top-level `shot` (the live product URL from its devya.dev page) and `shotLabel` (host), plus `items` (3 short chips)

## Rules (the validator enforces most of these)

- **Language**: LinkedIn English every day. Facebook Arabic, except English on Tuesday and Saturday; Instagram the opposite. Arabic is Modern Standard Arabic (فصحى), short and plain, never Egyptian colloquial; start each Arabic line with an Arabic word so it renders right-to-left; product names stay in Latin script. An English caption contains no Arabic.
- **Mix over any 7 days**: about 2 client-value, 2 engineering, 1–2 product, 1 bts/culture, at most 1 case-study. At most 2 product posts in any 5 days. No layout more than twice in 7 days. Lighter posts (culture, case study, bts) on Friday and Saturday.
- **No repeats**: no topic or hook used in the last 28 days of the calendar; no two of the last five posts open the same way. The three captions of a day share the topic but are written separately for each network's tone.
- **Grounded**: every claim comes from the source page. No invented metrics, client counts, testimonials, prices, timelines or growth numbers. Nothing called "launched" or "available" unless the page says so. No client names, logos or client project details. Never mention Driftcode. Domain is `devya.dev`; email `contact@devya.dev`.
- **Links**: every link is `https://www.devya.dev/...?utm_source=<network>&utm_medium=social`. LinkedIn: link only when `linkedinLink` is true, at the end. Facebook: one link at the end. Instagram: no links, say "link in bio" / "الرابط في البايو".
- **Hashtags**: LinkedIn 3–5 (include `#BuildWithDevya`), Instagram 5–8 at the end, Facebook none. No @-mentions.
- **Length**: LinkedIn 120–220 words, Instagram 40–90 words, Facebook 60–140 words. Card text short enough to fit: titles under ~60 characters, items under ~40.

When the file is written, print one line: `TOPUP_DONE: <first date> → <last date>`.
