import { createFileRoute, Link } from '@tanstack/react-router';
import { H1, H2, Lede, Card, Pill } from '../components/Layout';

export const Route = createFileRoute('/')({
  component: Overview,
});

const LIVE = [
  { channel: 'LinkedIn company', what: 'Name → "Devya Software Solutions"' },
  { channel: 'LinkedIn company', what: 'Tagline → "Software that ships. Web · mobile · AI for MENA founders, serving worldwide. devya.dev"' },
  { channel: 'LinkedIn company', what: 'Overview (1,060 chars, founder-voice)' },
  { channel: 'LinkedIn company', what: 'Phone +201055930032, Year founded 2024' },
  { channel: 'LinkedIn company', what: 'Post 1 (devya-contracts launch) published + Featured pinned' },
  { channel: 'LinkedIn personal', what: 'Headline → founder-first (Devya + _VOIS + ITI)' },
  { channel: 'LinkedIn personal', what: 'About (1,681 chars founder-voice)' },
  { channel: 'LinkedIn personal', what: 'Services overview rewritten (469/500)' },
  { channel: 'Facebook', what: 'Services × 6 added with descriptions' },
  { channel: 'Facebook', what: 'Post 1 published + pinned to Featured items' },
  { channel: 'Instagram', what: 'Bio updated to canon (130/150)' },
  { channel: 'Marketing site', what: 'Social links audited + hardened (target/rel/aria)' },
  { channel: 'Asset engine', what: 'JSON-driven SVG → PNG renderer + 3 sample cards' },
];

const PENDING = [
  { item: 'LinkedIn company Specialties × 17', blocker: 'lock', lever: 'Retry fresh session ~2 min' },
  { item: 'IG mobile flow: archive 7 AI posts + Software Company category + WhatsApp/Email buttons + 5 Highlights', blocker: 'mobile', lever: '~15 min on phone, per ig-mobile-checklist.md' },
  { item: 'LinkedIn Locations → Cairo HQ', blocker: 'lock', lever: '2 min retry' },
  { item: 'LinkedIn Buttons → custom CTA', blocker: 'lock', lever: '2 min retry' },
  { item: 'LinkedIn personal Devya Experience entry', blocker: 'open', lever: '3 min, paste from li-personal-enhancement.md § 4' },
  { item: 'LinkedIn personal Featured cards (devya.dev, company page, GitHub)', blocker: 'open', lever: '5 min' },
  { item: 'LinkedIn personal banner upload', blocker: 'open', lever: '2 min — file ready' },
  { item: 'LinkedIn personal "Open to providing services" toggle', blocker: 'open', lever: '1 min' },
  { item: 'Reserve @devya_solutions on IG/FB/LinkedIn/TikTok/Threads/YouTube/GitHub', blocker: '2FA', lever: '~15 min, per ig-handle-squat.md' },
];

function Overview() {
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Pill tone="ember">Marketing brief</Pill>
        <Pill tone="mono">Updated 2026-06-29</Pill>
      </div>
      <H1>Devya brand · live now + what's next.</H1>
      <Lede>
        Status snapshot for the marketing team. Everything below is ready to execute. Brand canon, asset library, content pipeline, and prioritized next steps are linked in the top nav.
      </Lede>

      <div className="grid md:grid-cols-3 gap-4 mt-10">
        <Card>
          <div className="text-xs uppercase tracking-widest text-ink-400 mb-2">Followers</div>
          <div className="text-3xl font-bold">11K + 762 + 15</div>
          <div className="text-sm text-ink-400 mt-2">Facebook · Instagram · LinkedIn</div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-widest text-ink-400 mb-2">Live posts pinned</div>
          <div className="text-3xl font-bold">2</div>
          <div className="text-sm text-ink-400 mt-2">devya-contracts launch on FB + LinkedIn</div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-widest text-ink-400 mb-2">Posts queued</div>
          <div className="text-3xl font-bold">17</div>
          <div className="text-sm text-ink-400 mt-2">3 batches × 6 posts (EN + AR) — copy ready</div>
        </Card>
      </div>

      <H2>What's live (push to public)</H2>
      <Card>
        <ul className="divide-y divide-ink-800">
          {LIVE.map((row, i) => (
            <li key={i} className="py-2.5 flex items-start gap-4 text-sm">
              <Pill tone="lime">live</Pill>
              <div className="flex-1">
                <div className="text-ink-400 text-xs tracking-wide uppercase mb-1">{row.channel}</div>
                <div>{row.what}</div>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <H2>What's pending (manual execution)</H2>
      <Card>
        <ul className="divide-y divide-ink-800">
          {PENDING.map((row, i) => (
            <li key={i} className="py-3 grid grid-cols-1 md:grid-cols-[1fr_120px_220px] gap-3 md:gap-6 text-sm items-start">
              <div className="text-ink-100">{row.item}</div>
              <div>
                <Pill tone={row.blocker === 'lock' || row.blocker === '2FA' || row.blocker === 'mobile' ? 'red' : 'azure'}>
                  {row.blocker}
                </Pill>
              </div>
              <div className="text-ink-300 text-sm">{row.lever}</div>
            </li>
          ))}
        </ul>
      </Card>

      <H2>Pick your lane</H2>
      <div className="grid md:grid-cols-3 gap-4">
        <Link to="/execute" className="block hover:no-underline">
          <Card className="hover:border-ember/60 transition-colors">
            <Pill tone="ember">Start here</Pill>
            <div className="text-lg font-semibold mt-3 mb-1">Execute</div>
            <div className="text-sm text-ink-300">Top-5 highest-ROI moves this week.</div>
          </Card>
        </Link>
        <Link to="/assets" className="block hover:no-underline">
          <Card className="hover:border-ember/60 transition-colors">
            <Pill tone="azure">Files</Pill>
            <div className="text-lg font-semibold mt-3 mb-1">Asset library</div>
            <div className="text-sm text-ink-300">Every PNG/SVG ready to upload.</div>
          </Card>
        </Link>
        <Link to="/content" className="block hover:no-underline">
          <Card className="hover:border-ember/60 transition-colors">
            <Pill tone="lime">Copy</Pill>
            <div className="text-lg font-semibold mt-3 mb-1">Post pipeline</div>
            <div className="text-sm text-ink-300">17 posts × EN + AR + briefs.</div>
          </Card>
        </Link>
      </div>
    </>
  );
}
