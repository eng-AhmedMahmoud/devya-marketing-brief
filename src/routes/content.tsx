import { createFileRoute } from '@tanstack/react-router';
import { H1, H2, Lede, Card, Pill } from '../components/Layout';

export const Route = createFileRoute('/content')({
  component: Content,
});

type Post = { n: number; topic: string; channels: string; time: string; date: string; kind: string };

const BATCH_1: Post[] = [
  { n: 1, topic: 'devya-contracts launch (bilingual generator)', channels: 'FB + IG + LinkedIn', time: '19:30', date: 'Tue 2026-06-30', kind: 'ship' },
  { n: 2, topic: 'booking-app reveal (own Calendly)', channels: 'FB + IG', time: '12:00', date: 'Wed 2026-07-01', kind: 'ship' },
  { n: 3, topic: 'Agency case study (carousel)', channels: 'FB + IG carousel', time: '20:00', date: 'Sun 2026-07-05', kind: 'case' },
  { n: 4, topic: 'Design system BTS', channels: 'FB + IG', time: '09:00', date: 'Thu 2026-07-02', kind: 'BTS' },
  { n: 5, topic: 'Friday demos culture', channels: 'FB + IG', time: '16:30', date: 'Fri 2026-07-03', kind: 'culture' },
  { n: 6, topic: 'Sister-brand (LOCKED OFF)', channels: '—', time: '—', date: 'deferred', kind: 'locked' },
];

const BATCH_2: Post[] = [
  { n: 7, topic: 'One backend architecture decision', channels: 'FB + IG', time: '09:00', date: 'Tue 2026-07-14', kind: 'tech' },
  { n: 8, topic: 'Hiring announcement', channels: 'FB + IG', time: '10:00', date: 'Sun 2026-07-19', kind: 'hiring' },
  { n: 9, topic: 'tasks-app client win (carousel)', channels: 'FB + IG carousel', time: '19:30', date: 'Mon 2026-07-20', kind: 'case' },
  { n: 10, topic: 'Driftcode dashboard (LOCKED OFF)', channels: '—', time: '—', date: 'deferred', kind: 'locked' },
  { n: 11, topic: 'No discovery calls (founder POV)', channels: 'FB + IG', time: '20:00', date: 'Wed 2026-07-15', kind: 'POV' },
  { n: 12, topic: 'Paid bookings update', channels: 'FB + IG', time: '12:00', date: 'Wed 2026-07-22', kind: 'product' },
];

const BATCH_3: Post[] = [
  { n: 13, topic: 'Lessons learned (anti-pattern we abandoned)', channels: 'FB + IG + LinkedIn', time: '09:00', date: 'Week 5', kind: 'POV' },
  { n: 14, topic: 'Tool stack POV (Prisma vs TypeORM)', channels: 'FB + IG + LinkedIn article', time: '12:00', date: 'Week 5', kind: 'tech' },
  { n: 15, topic: 'MENA market angle (specific pain)', channels: 'FB + IG', time: '18:00', date: 'Week 5', kind: 'market' },
  { n: 16, topic: 'Process transparency (real artifact)', channels: 'FB + IG', time: '10:00', date: 'Week 5', kind: 'BTS' },
  { n: 17, topic: 'Open community question', channels: 'FB + IG + LinkedIn', time: '19:30', date: 'Week 5', kind: 'engage' },
  { n: 18, topic: 'H1 2026 recap', channels: 'FB + IG + LinkedIn article', time: '20:00', date: 'Sun 2026-07-05', kind: 'recap' },
];

const BRIEFS = [
  { name: 'fb-planner-cadence.md', what: '6-week dated master schedule + Meta Business Suite walkthrough', size: '17.8 KB' },
  { name: 'ig-mobile-checklist.md', what: 'Phone-only flow: archive 7 AI posts, set Software Company category, action buttons, 5 Highlights', size: '5.0 KB' },
  { name: 'ig-handle-squat.md', what: 'Defensive registration of @devya_solutions on 7 platforms', size: '11.9 KB' },
  { name: 'profile-enhancement-copy.md', what: 'Paste-ready FB/IG/LinkedIn company profile field copy', size: '6.1 KB' },
  { name: 'li-personal-enhancement.md', what: 'Personal LinkedIn rewrite (headline, About, Experience, Featured, Services)', size: '8.8 KB' },
  { name: 'fb-cover-brief.md', what: 'FB cover design spec (3 concepts, Concept A picked)', size: '8.4 KB' },
  { name: 'ig-highlights-brief.md', what: 'Design spec for 5 IG Highlight covers', size: '9.0 KB' },
  { name: 'li-assets-brief.md', what: 'LinkedIn banner + hero design spec', size: '8.4 KB' },
];

function Row({ p }: { p: Post }) {
  const locked = p.kind === 'locked';
  return (
    <tr className={`border-b border-ink-800 last:border-0 ${locked ? 'opacity-40' : ''}`}>
      <td className="py-3 pr-3 font-mono text-xs text-ember w-12">P{String(p.n).padStart(2, '0')}</td>
      <td className="py-3 pr-4">
        <div className="font-medium text-sm">{p.topic}</div>
        <div className="text-xs text-ink-400 mt-0.5 capitalize">{p.kind}</div>
      </td>
      <td className="py-3 pr-4 text-xs text-ink-300">{p.channels}</td>
      <td className="py-3 pr-4 font-mono text-xs text-ink-300">{p.date}</td>
      <td className="py-3 font-mono text-xs text-ink-300">{p.time}</td>
    </tr>
  );
}

function Batch({ title, posts, source }: { title: string; posts: Post[]; source: string }) {
  return (
    <Card className="mb-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-lg">{title}</h3>
        <span className="font-mono text-xs text-ink-400">{source}</span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-ink-400 uppercase text-[10px] tracking-widest border-b border-ink-700">
            <th className="text-left py-2 pr-3">#</th>
            <th className="text-left py-2 pr-4">Topic</th>
            <th className="text-left py-2 pr-4">Channels</th>
            <th className="text-left py-2 pr-4">Date</th>
            <th className="text-left py-2">Time (Cairo)</th>
          </tr>
        </thead>
        <tbody>
          {posts.map((p) => <Row key={p.n} p={p} />)}
        </tbody>
      </table>
    </Card>
  );
}

function Content() {
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Pill tone="lime">Content pipeline</Pill>
        <Pill tone="mono">18 posts × EN + AR</Pill>
      </div>
      <H1>Posts ready to ship.</H1>
      <Lede>
        Each post has 4 variants: EN-Facebook (~120w), EN-Instagram (~70w), AR-Facebook, AR-Instagram. Full text bodies + image briefs + hashtags + post-time in <span className="font-mono text-ember">devya-social/posts/batch-N.md</span>. AR slot = EN slot + 2h same day.
      </Lede>

      <H2>Batch 1 — launch week</H2>
      <Batch title="Posts 1–6 · Mon 2026-06-29 → Sun 2026-07-05" posts={BATCH_1} source="posts/batch-1.md" />

      <H2>Batch 2 — week 3</H2>
      <Batch title="Posts 7–12 · Mon 2026-07-13 → Sun 2026-07-26" posts={BATCH_2} source="posts/batch-2.md" />

      <H2>Batch 3 — week 5</H2>
      <Batch title="Posts 13–18 · Mon 2026-06-29 → Sun 2026-07-05 (per cadence brief)" posts={BATCH_3} source="posts/batch-3.md" />

      <H2>Briefs — read before executing</H2>
      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-ink-400 uppercase text-[10px] tracking-widest border-b border-ink-700">
              <th className="text-left py-2 pr-4">Brief</th>
              <th className="text-left py-2 pr-4">What it tells you</th>
              <th className="text-left py-2">Size</th>
            </tr>
          </thead>
          <tbody>
            {BRIEFS.map((b) => (
              <tr key={b.name} className="border-b border-ink-800 last:border-0">
                <td className="py-3 pr-4 font-mono text-ember text-xs whitespace-nowrap">{b.name}</td>
                <td className="py-3 pr-4 text-sm">{b.what}</td>
                <td className="py-3 font-mono text-xs text-ink-400">{b.size}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <H2>Per-post hygiene (don't skip)</H2>
      <Card>
        <ul className="space-y-3 text-sm">
          <li><span className="text-ember font-semibold">0–10 min after publish:</span> reply to first 3 comments in founder voice. Reply velocity is a top-3 edge-rank signal.</li>
          <li><span className="text-ember font-semibold">0–15 min:</span> like every comment (including spam — don't reply to spam, just like).</li>
          <li><span className="text-ember font-semibold">0–60 min:</span> drop the post link in 1 WhatsApp/Slack channel for external traffic.</li>
          <li><span className="text-ember font-semibold">24 h:</span> if it's the week's top performer → pin to FB page top (+40% lifetime reach).</li>
          <li><span className="text-ember font-semibold">48 h:</span> log reach + engagement to <span className="font-mono">STATUS.md</span>.</li>
          <li><span className="text-ember font-semibold">Every Sunday:</span> screenshot weekly insights tile, drop in <span className="font-mono">assets/insights/wk-YYYY-WW.png</span>.</li>
        </ul>
      </Card>
    </>
  );
}
