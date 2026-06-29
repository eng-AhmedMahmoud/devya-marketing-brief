import { createFileRoute } from '@tanstack/react-router';
import { H1, H2, Lede, Card, Pill } from '../components/Layout';
import type { ReactNode } from 'react';

export const Route = createFileRoute('/strategy')({
  component: Strategy,
});

const PHASES = [
  {
    n: 0,
    window: 'Now',
    title: 'Ship what\'s drafted',
    summary: 'Copy + assets exist. Execution is manual.',
    items: [
      'LinkedIn company Specialties × 17 (admin retry)',
      'IG mobile flow (phone-only, ~15 min)',
      'LinkedIn Locations → Cairo HQ',
      'LinkedIn Buttons → WhatsApp CTA',
      'Personal LI Experience entry + Featured cards + banner + Open-to-services toggle',
      'Reserve @devya_solutions on 7 platforms defensively',
    ],
  },
  {
    n: 1,
    window: 'Weeks 2–4',
    title: 'Channel expansion',
    summary: 'Plant the flag everywhere a MENA founder/CTO might look.',
    items: [
      'YouTube channel + 3 screen-record walkthroughs (admin → booking → contracts)',
      'LinkedIn engagement play: comment on 10 MENA founder/CTO posts/day × 2 weeks',
      'Repurpose Posts 7 + 14 → LinkedIn long-form articles',
      'Enable LinkedIn Employee Notifications on company page (boost every employee post)',
    ],
  },
  {
    n: 2,
    window: 'Weeks 3–8',
    title: 'Content engine',
    summary: 'Solid-asset cadence. No more text-only posts.',
    items: [
      'Cadence target: FB+IG 3×/week · LinkedIn 2×/week',
      'Real product screen-records for Posts 2, 4, 9, 12 (booking-app, design-system BTS, tasks-app, paid bookings)',
      'Founder/team photo shoot (phone, natural light, 30 min)',
      'Extend card template engine for carousel slides (Posts 3 + 9 need 4–5 slides each)',
      'Bundle Sora as woff2 @font-face data URI in renderer',
      'Hire 5h/week junior social-ops if week-4 metrics show cadence slip',
    ],
  },
  {
    n: 3,
    window: 'Weeks 6–12',
    title: 'Audience activation',
    summary: 'Turn followers into discovery calls and case studies.',
    items: [
      'Lead capture: weekly build-log email (ConvertKit/Buttondown) — 1 email/week recap + 1 free resource',
      'Discord/Telegram MENA founders+engineers community (host, don\'t dominate)',
      'Monthly free 30-min office hour on IG/LinkedIn — live audit format',
      '3 client testimonial videos × 3 cuts each (FB long, IG Reel, LinkedIn carousel)',
      'Driftcode launch — LOCKED OFF until founder greenlights; bundle full asset pack first',
    ],
  },
  {
    n: 4,
    window: 'Continuous from week 4',
    title: 'Measurement',
    summary: 'Decisions need numbers. Sunday 15-min pull. Decision gates at W4 + W8.',
    items: [
      'Weekly metric pull → metrics/2026-weekly.csv (FB/IG/LinkedIn insights + GA referrals + booked calls via UTM ?ref=social-<platform>)',
      'Week 4 gate: if LinkedIn engagement > 2× IG, double LinkedIn cadence',
      'Week 8 gate: if zero booked calls from social, rework CTAs + post hygiene',
      'Quarterly retro post — becomes content itself',
    ],
  },
  {
    n: 5,
    window: '3–6 months',
    title: 'Brand maturity',
    summary: 'Past SVG illustrations. Real evidence at scale.',
    items: [
      'Real photo library replacing illustration-only assets',
      'Founder explainer videos (60s per service: Web / Mobile / AI)',
      'Verification: FB Meta Verified ($11.99/mo at 1k+ followers) + LinkedIn free with contact@devya.dev',
      'MENA tech press placement (Wamda, MenaBytes) — after 3 strong case studies exist',
      'Sponsor MENA dev event ($500–2k) for logo + lightning talk + 6 months of authentic content',
    ],
  },
];

const PILL_BY_PHASE = ['ember', 'azure', 'lime', 'ember', 'azure', 'lime'] as const;
type PillTone = typeof PILL_BY_PHASE[number];

function PhaseBlock({ n, window, title, summary, items, tone }: {
  n: number; window: string; title: string; summary: string; items: string[]; tone: PillTone;
}) {
  return (
    <Card className="mb-5">
      <div className="flex items-baseline justify-between mb-3 gap-3 flex-wrap">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-ember/60 text-3xl font-bold leading-none">P{n}</span>
          <h3 className="text-2xl font-bold">{title}</h3>
        </div>
        <Pill tone={tone}>{window}</Pill>
      </div>
      <p className="text-ink-300 text-sm mb-4">{summary}</p>
      <ul className="space-y-2 text-sm">
        {items.map((it, i) => (
          <li key={i} className="flex gap-3">
            <span className="text-ember mt-1">▸</span>
            <span className="text-ink-200 flex-1">{it}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

const NOT_DOING: { title: string; why: ReactNode }[] = [
  { title: 'Paid ads (yet)', why: <>Until organic CTR proves post bodies convert, paid spend just amplifies a leak.</> },
  { title: 'Generic AI listicle posts', why: <>The trashed 7 Nov 2025 posts are why. We write founder-voice or nothing.</> },
  { title: 'Cross-posting bilingual blob captions', why: <>Algorithm penalty — separate EN/AR posts per <span className="font-mono text-ember">fb-planner-cadence.md</span>.</> },
  { title: 'Reels-only strategy', why: <>Devya audience (B2B founders, CTOs) lives on LinkedIn + email more than IG Reels. Reels = side-channel.</> },
  { title: 'Squat-then-park', why: <>Every reserved handle redirects to canonical account — never sits empty.</> },
  { title: 'Introducing Driftcode (sister brand)', why: <>Founder explicitly locked it OFF until full asset pack ready. Don't mention anywhere.</> },
  { title: 'Twitter / X presence', why: <>Removed from plan per founder decision. Focus stays on FB + IG + LinkedIn + YouTube.</> },
];

function Strategy() {
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Pill tone="ember">5-phase strategy</Pill>
        <Pill tone="mono">6 months horizon</Pill>
      </div>
      <H1>Strategy roadmap.</H1>
      <Lede>
        Six phases from now → 6 months. Each phase has a window, theme, and concrete items. Phases 0–1 are this month's work; Phases 4–5 unlock once 3+ case studies exist.
      </Lede>

      <div className="mt-10">
        {PHASES.map((p) => (
          <PhaseBlock key={p.n} {...p} tone={PILL_BY_PHASE[p.n]} />
        ))}
      </div>

      <H2>What we're explicitly NOT doing</H2>
      <Card>
        <ul className="divide-y divide-ink-800">
          {NOT_DOING.map((nd, i) => (
            <li key={i} className="py-3 grid md:grid-cols-[260px_1fr] gap-3 text-sm items-start">
              <div className="flex items-start gap-2">
                <span className="text-red-400 font-bold mt-0.5">×</span>
                <span className="font-semibold">{nd.title}</span>
              </div>
              <div className="text-ink-300">{nd.why}</div>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
