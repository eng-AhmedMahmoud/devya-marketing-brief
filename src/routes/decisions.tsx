import { createFileRoute } from '@tanstack/react-router';
import { H1, H2, Lede, Card, Pill } from '../components/Layout';

export const Route = createFileRoute('/decisions')({
  component: Decisions,
});

const OPEN = [
  {
    q: 'Driftcode launch timing',
    options: ['Wait for full asset pack (banner, screenshots, flow-field demo) before launching', 'Launch lean, build assets in public'],
    reco: 'Wait — bundle asset pack first. Avoids re-pinning posts and protects Devya focus.',
    impact: 'Blocks 2 posts (P6 + P10) until decided. Currently scrubbed from all live profiles.',
  },
  {
    q: 'LinkedIn Premium tier for Devya',
    options: ['Reactivate Premium Career (~$30/mo)', 'Sales Navigator (~$80–100/mo)', 'Business Profile Pro (~$12–60/mo)'],
    reco: 'Sales Navigator IF you commit 1–2 hrs/week outbound prospecting. Otherwise Premium Career as cheap insurance.',
    impact: 'Sales Nav = best for B2B client pipeline. One landed client pays it back 100×.',
  },
  {
    q: 'YouTube voice',
    options: ['Screen-only voiceover (no on-camera)', 'Founder-on-camera intro + screen demo'],
    reco: 'Screen-only for first 3 to test engagement. On-camera if numbers justify production overhead.',
    impact: 'Affects time-per-video by ~3×. Screen-only = 30 min total per video; on-camera = 90 min.',
  },
  {
    q: 'Social ops hire trigger',
    options: ['Hire 5h/week junior now', 'Wait until week-4 metrics show cadence slip'],
    reco: 'Wait. If founder maintains cadence solo, defer. If cadence drops below 3×/week FB+IG for 2 consecutive weeks → hire.',
    impact: '~$250–400/month cost vs. founder time savings.',
  },
  {
    q: 'Pricing on LinkedIn Services page',
    options: ['Keep $60/hr', 'Bump to $80/hr (median MENA senior)', 'Bump to $100/hr (Devya studio rate)'],
    reco: '$100/hr. Filters tire-kickers. Defensible given _VOIS + Devya credentials.',
    impact: 'Current $60/hr undersells; pricing signals expertise.',
  },
  {
    q: 'Real product screen captures',
    options: ['Founder captures (2h Saturday session)', 'Delegate to social-ops hire when onboarded'],
    reco: 'Founder captures the first round (highest quality, knows what to show). Future rounds delegate.',
    impact: 'Posts 2, 4, 9, 12 blocked until captured. Each = 30 min effort.',
  },
];

function Decisions() {
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Pill tone="ember">Decisions parked</Pill>
        <Pill tone="mono">Founder input needed</Pill>
      </div>
      <H1>Open decisions for founder.</H1>
      <Lede>
        Each decision below blocks downstream work. Recommendations are noted but not committed — founder owns the call. Confirm in any channel and we lock + ship.
      </Lede>

      <div className="space-y-5 mt-10">
        {OPEN.map((d, i) => (
          <Card key={i}>
            <div className="flex items-baseline gap-4 mb-4">
              <span className="text-4xl font-bold text-ember/40 font-mono leading-none">Q{i + 1}</span>
              <h3 className="text-xl font-bold flex-1">{d.q}</h3>
            </div>

            <div className="text-xs uppercase tracking-widest text-ink-400 mb-2">Options</div>
            <ul className="space-y-1 mb-4 text-sm">
              {d.options.map((opt, j) => (
                <li key={j} className="flex gap-2 text-ink-200">
                  <span className="text-ink-500">{String.fromCharCode(65 + j)}.</span>
                  <span>{opt}</span>
                </li>
              ))}
            </ul>

            <div className="text-xs uppercase tracking-widest text-lime mb-2">Recommendation</div>
            <p className="text-sm text-ink-200 mb-4 italic">{d.reco}</p>

            <div className="text-xs uppercase tracking-widest text-ink-400 mb-2">Impact</div>
            <p className="text-sm text-ink-300">{d.impact}</p>
          </Card>
        ))}
      </div>

      <H2>How to lock a decision</H2>
      <Card>
        <p className="text-sm text-ink-300 mb-3">
          DM the founder with the question number (Q1–Q6) and the chosen letter (A/B/C). Example: <span className="font-mono text-ember">"Q2: B"</span> (Sales Navigator).
        </p>
        <p className="text-sm text-ink-300">
          Locked decisions get committed back to <span className="font-mono text-ember">devya-social/STATUS.md</span> and update across briefs.
        </p>
      </Card>
    </>
  );
}
