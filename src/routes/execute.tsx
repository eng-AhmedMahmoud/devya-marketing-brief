import { createFileRoute, Link } from '@tanstack/react-router';
import { H1, H2, Lede, Card, Pill } from '../components/Layout';

export const Route = createFileRoute('/execute')({
  component: Execute,
});

const TOP_5 = [
  {
    rank: 1,
    title: 'IG mobile flow (15 min · phone)',
    why: 'Finishes IG identity. Currently broken: 7 AI-fluff posts still live on grid, no Highlights, no action buttons, no Business category.',
    how: [
      'Open IG app on phone, log in as @devyasoftware.',
      'Archive 7 AI posts: each post → ⋯ → Archive.',
      'Profile → Edit profile → Category → search "Software Company".',
      'Profile → Edit profile → Contact options → Email = contact@devya.dev, Phone = +201055930032.',
      'Action buttons → add WhatsApp (+201055930032) + Email.',
      'Create 5 Story highlights with covers from assets/highlights/ (PROCESS → WORDS → SERVICES → TEAM → WORK so left-to-right reads WORK first).',
    ],
    ref: 'briefs/ig-mobile-checklist.md',
  },
  {
    rank: 2,
    title: 'Capture booking-app screen recording (30 min · desktop)',
    why: 'Post 2 in cadence needs real product asset. Solid asset > text-only post. 30-min QuickTime screen record → trim to 12s → upload with caption from batch-1.md.',
    how: [
      'cd booking-app && pnpm dev (boots on portless).',
      'Open booking.devya.localhost (or similar) in browser.',
      'QuickTime → New Screen Recording → record clicking through slot picker + booking flow.',
      'Trim to 10–15 seconds in QuickTime (Edit → Trim).',
      'Export at 1080×1080 (square for IG) or 1920×1080 (FB landscape).',
      'Drop in assets/products/booking-app/.',
    ],
    ref: 'posts/batch-1.md § Post 2',
  },
  {
    rank: 3,
    title: 'Reserve @devya_solutions across 7 platforms (15 min)',
    why: 'Old IG handle freed up after rebrand. Squat it before someone impersonates. Same on FB / TikTok / Threads / YouTube / GitHub.',
    how: [
      'Pick a separate email alias (e.g. squat+ig@devya.dev).',
      'Register handle on each platform with that email.',
      'Bio: "We moved → @devyasoftware" + link to devya.dev.',
      'Enable 2FA on each, save backup codes to password manager.',
      'Cross-platform variants: @devya_solutions / @devyasolutions / @devya-solutions.',
    ],
    ref: 'briefs/ig-handle-squat.md',
  },
  {
    rank: 4,
    title: 'LinkedIn admin retry (5 min)',
    why: 'Specialties × 17 + Locations (Cairo HQ) + Buttons (custom WhatsApp CTA) were blocked by a concurrent admin lock earlier. Try again.',
    how: [
      'Open linkedin.com/company/devya-solutions/admin/edit/?editPageActiveTab=details in one tab only.',
      'Confirm no other admin tabs/devices are open on the page.',
      'Add 17 specialties: Software Development, Web Development, Mobile Development, AI Integration, NestJS, Next.js, React Native, Internal Tools, MENA Software, Bilingual Apps, Booking Systems, Contract Automation, Admin Dashboards, API Design, Postgres, Cloud Deployment, B2B SaaS.',
      'Locations tab → add Cairo, Egypt as primary HQ.',
      'Buttons tab → custom CTA → WhatsApp link (or Contact).',
    ],
    ref: 'briefs/profile-enhancement-copy.md § LinkedIn',
  },
  {
    rank: 5,
    title: 'Render first 5 brand cards (10 min)',
    why: 'Asset engine is live but only 3 sample cards exist. Render 5 more so next 5 posts can ship with solid visuals.',
    how: [
      'Open devya-social/assets/templates/posts.json.',
      'Append 5 new card entries with: slug, kind (quote/stat/tech/announcement), label, headline, body.',
      'Pull headlines from batch-1.md and batch-2.md (each post has a quotable line).',
      'cd devya-social/assets/templates && node render-cards.mjs.',
      'PNGs land in assets/cards/. Each card outputs both square (IG) and landscape (FB/LinkedIn).',
    ],
    ref: 'templates/render-cards.mjs',
  },
];

function Execute() {
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Pill tone="ember">Start here</Pill>
        <Pill tone="mono">Top 5 ROI moves</Pill>
      </div>
      <H1>This week's execution.</H1>
      <Lede>
        Ranked by ROI ÷ effort. Pick #1, finish, ship next. No multitasking. Each card lists why it matters, exact steps, and which reference brief to read.
      </Lede>

      <div className="space-y-5 mt-10">
        {TOP_5.map((t) => (
          <Card key={t.rank}>
            <div className="flex items-baseline gap-4 mb-3">
              <span className="text-5xl font-bold text-ember/40 font-mono leading-none">#{t.rank}</span>
              <h3 className="text-xl font-bold flex-1">{t.title}</h3>
            </div>
            <p className="text-ink-300 text-sm mb-4">{t.why}</p>
            <div className="text-xs uppercase tracking-widest text-ink-400 mb-2">Steps</div>
            <ol className="space-y-2 text-sm list-decimal pl-5 mb-4">
              {t.how.map((step, i) => <li key={i} className="text-ink-200">{step}</li>)}
            </ol>
            <div className="text-xs text-ink-400">
              Ref: <span className="font-mono text-ember">{t.ref}</span>
            </div>
          </Card>
        ))}
      </div>

      <H2>This month's cadence target</H2>
      <Card>
        <div className="grid md:grid-cols-3 gap-6">
          <div>
            <div className="text-3xl font-bold mb-1">3×<span className="text-ink-400 text-lg ml-1">/week</span></div>
            <div className="text-sm text-ink-300">Facebook + Instagram</div>
            <div className="text-xs text-ink-400 mt-2">Mon/Wed/Fri 10:00 Cairo · 2 stories/week</div>
          </div>
          <div>
            <div className="text-3xl font-bold mb-1">2×<span className="text-ink-400 text-lg ml-1">/week</span></div>
            <div className="text-sm text-ink-300">LinkedIn (company + personal)</div>
            <div className="text-xs text-ink-400 mt-2">Tue + Thu 09:00 Cairo · longer-form, B2B</div>
          </div>
          <div>
            <div className="text-3xl font-bold mb-1">1×<span className="text-ink-400 text-lg ml-1">/month</span></div>
            <div className="text-sm text-ink-300">YouTube screen-record walkthrough</div>
            <div className="text-xs text-ink-400 mt-2">admin → booking → contracts → tasks (one per release)</div>
          </div>
        </div>
      </Card>

      <H2>Tools you need access to</H2>
      <Card>
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-ink-800"><td className="py-3 pr-6 font-medium w-56">Meta Business Suite</td><td className="text-ink-300">business.facebook.com — Devya Software Solutions page + IG @devyasoftware connected</td></tr>
            <tr className="border-b border-ink-800"><td className="py-3 pr-6 font-medium">LinkedIn company admin</td><td className="text-ink-300">linkedin.com/company/devya-solutions/admin/ — needs Admin role</td></tr>
            <tr className="border-b border-ink-800"><td className="py-3 pr-6 font-medium">rsvg-convert</td><td className="text-ink-300">brew install librsvg — for SVG → PNG card rendering</td></tr>
            <tr className="border-b border-ink-800"><td className="py-3 pr-6 font-medium">Node ≥ 18</td><td className="text-ink-300">For the card renderer (assets/templates/render-cards.mjs)</td></tr>
            <tr className="border-b border-ink-800"><td className="py-3 pr-6 font-medium">QuickTime / Cleanshot</td><td className="text-ink-300">For product screen recordings</td></tr>
            <tr><td className="py-3 pr-6 font-medium">Phone with IG app</td><td className="text-ink-300">For Highlights + Archive (mobile-only flows)</td></tr>
          </tbody>
        </table>
      </Card>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link to="/strategy" className="px-4 py-2 rounded-md bg-ember/10 text-ember border border-ember/60 text-sm font-medium hover:bg-ember/20 hover:no-underline">View 5-phase strategy →</Link>
        <Link to="/content" className="px-4 py-2 rounded-md bg-ink-800 text-ink-200 border border-ink-700 text-sm font-medium hover:bg-ink-700 hover:no-underline">View post pipeline →</Link>
      </div>
    </>
  );
}
