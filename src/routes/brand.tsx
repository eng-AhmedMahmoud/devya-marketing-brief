import { createFileRoute } from '@tanstack/react-router';
import { H1, H2, Lede, Card, Pill } from '../components/Layout';

export const Route = createFileRoute('/brand')({
  component: Brand,
});

const PALETTE = [
  { name: 'ink-950', hex: '#0A0A0A', use: 'Deepest background' },
  { name: 'ink-900', hex: '#0F0F0F', use: 'Primary background' },
  { name: 'ink-800', hex: '#1A1A1A', use: 'Card surface' },
  { name: 'ink-700', hex: '#262626', use: 'Borders, dots' },
  { name: 'ink-400', hex: '#737373', use: 'Muted text, handles' },
  { name: 'ink-300', hex: '#A3A3A3', use: 'Body text on dark' },
  { name: 'ink-100', hex: '#F5F5F5', use: 'Headlines, primary text' },
  { name: 'ember', hex: '#F97316', use: 'Accent · founder/quote posts' },
  { name: 'azure', hex: '#3B82F6', use: 'Accent · stats/tech posts' },
  { name: 'lime', hex: '#10B981', use: 'Accent · process/win posts' },
];

const FACTS = [
  { k: 'Display name', v: 'Devya Software Solutions' },
  { k: 'Tagline', v: 'Software that ships. Web · mobile · AI for MENA founders, serving worldwide.' },
  { k: 'Domain', v: 'devya.dev', note: 'NEVER devya.solutions / devya.com' },
  { k: 'Email', v: 'contact@devya.dev' },
  { k: 'WhatsApp', v: '+20 010 5593 0032' },
  { k: 'Cairo phone format', v: '+201055930032 (digits only on LinkedIn)' },
  { k: 'HQ', v: 'Cairo, Egypt · Remote available' },
  { k: 'Founded', v: '2024' },
  { k: 'Founder', v: 'Ahmed Mahmoud (also Frontend Engineer @ _VOIS / ITI instructor)' },
];

const HANDLES = [
  { ch: 'Facebook', url: 'https://www.facebook.com/devyasoftware', handle: '@devyasoftware', followers: '11,000+' },
  { ch: 'Instagram', url: 'https://www.instagram.com/devyasoftware/', handle: '@devyasoftware', followers: '762' },
  { ch: 'LinkedIn (company)', url: 'https://www.linkedin.com/company/devya-solutions/', handle: '/company/devya-solutions', followers: '15' },
  { ch: 'LinkedIn (personal)', url: 'https://www.linkedin.com/in/ahmed-mahmoud-abouraia/', handle: '@ahmed-mahmoud-abouraia', followers: '18,060' },
];

const VOICE = [
  { name: 'Founder-to-founder', what: 'We write to other builders. First-person ("we", "I"), specific names of tools/apps, no buzzwords.' },
  { name: 'Specific over generic', what: 'Instead of "scalable solutions" → "Next.js + NestJS, ships in 6–12 weeks". Concrete > abstract.' },
  { name: 'No hedging', what: 'Drop "passionate", "innovative", "best-in-class". State opinions. Take sides.' },
  { name: 'Bilingual delivery', what: 'EN + AR posts ship side-by-side. Separate captions, never blob both languages.' },
  { name: 'Show the work', what: 'Real product names: devya-contracts, booking-app, admin-app, tasks-app, flow-map, Tabib Academy, Misr Stores.' },
];

const DONT = [
  'Use "devya.solutions" or "devya.com" (the canonical domain is devya.dev)',
  'Mention Driftcode anywhere — sister brand locked OFF until founder greenlights launch',
  'Auto-generated AI text or stock-image carousel filler (the trashed 7 Nov 2025 posts taught us)',
  'Generic listicle posts ("10 reasons to choose us")',
  'Cross-posting bilingual blob captions to both platforms — algorithm penalty',
  'Reels-only strategy — Devya audience is B2B founders/CTOs, mostly on LinkedIn + email',
];

function Brand() {
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Pill tone="ember">Brand canon</Pill>
        <Pill tone="mono">Single source of truth</Pill>
      </div>
      <H1>Brand canon.</H1>
      <Lede>
        Immutable. Every post, asset, profile field cross-checks against this page. Diverge → bring back to canon.
      </Lede>

      <H2>The facts</H2>
      <Card>
        <table className="w-full text-sm">
          <tbody>
            {FACTS.map((f) => (
              <tr key={f.k} className="border-b border-ink-800 last:border-0">
                <td className="py-3 pr-6 text-ink-400 uppercase tracking-wider text-xs w-48">{f.k}</td>
                <td className="py-3">
                  <span className="font-medium">{f.v}</span>
                  {f.note && <span className="ml-3 text-xs text-red-400">{f.note}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <H2>Channel handles</H2>
      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-ink-400 uppercase text-xs tracking-widest border-b border-ink-700">
              <th className="text-left py-2 pr-4">Channel</th>
              <th className="text-left py-2 pr-4">Handle</th>
              <th className="text-left py-2 pr-4">Followers</th>
              <th className="text-left py-2">URL</th>
            </tr>
          </thead>
          <tbody>
            {HANDLES.map((h) => (
              <tr key={h.ch} className="border-b border-ink-800 last:border-0">
                <td className="py-3 pr-4 font-medium">{h.ch}</td>
                <td className="py-3 pr-4 font-mono text-ember text-xs">{h.handle}</td>
                <td className="py-3 pr-4 text-ink-300">{h.followers}</td>
                <td className="py-3 text-xs"><a href={h.url}>{h.url.replace('https://www.', '')}</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <H2>Color palette</H2>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {PALETTE.map((c) => (
          <div key={c.name} className="rounded-xl border border-ink-700 bg-ink-850 overflow-hidden">
            <div className="aspect-square" style={{ background: c.hex }} />
            <div className="p-3">
              <div className="text-sm font-semibold">{c.name}</div>
              <div className="text-xs font-mono text-ink-400 mt-0.5">{c.hex}</div>
              <div className="text-[11px] text-ink-400 mt-2 leading-snug">{c.use}</div>
            </div>
          </div>
        ))}
      </div>

      <H2>Typography</H2>
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <div className="text-xs uppercase tracking-widest text-ink-400 mb-2">Display + body</div>
          <div className="text-5xl font-bold mb-2" style={{ fontFamily: 'Sora, sans-serif' }}>Sora</div>
          <div className="text-sm text-ink-300">300 / 400 / 500 / 600 / 700 / 800. Headlines = 700. Body = 400. Pill labels = 600 letter-spaced.</div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-widest text-ink-400 mb-2">Code + brand mark</div>
          <div className="text-5xl font-semibold mb-2 font-mono">&lt;/&gt; JetBrains</div>
          <div className="text-sm text-ink-300">500 / 600. Used in the `&lt;/&gt;DEVYA` brand mark + code tokens in posts.</div>
        </Card>
      </div>

      <H2>Voice rules</H2>
      <Card>
        <ul className="divide-y divide-ink-800">
          {VOICE.map((v) => (
            <li key={v.name} className="py-3 grid md:grid-cols-[200px_1fr] gap-3 text-sm items-start">
              <div className="font-semibold">{v.name}</div>
              <div className="text-ink-300">{v.what}</div>
            </li>
          ))}
        </ul>
      </Card>

      <H2>Don't list</H2>
      <Card>
        <ul className="space-y-3 text-sm">
          {DONT.map((d, i) => (
            <li key={i} className="flex gap-3">
              <span className="text-red-400 font-bold mt-0.5">×</span>
              <span>{d}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
