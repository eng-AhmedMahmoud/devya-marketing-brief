import { createFileRoute } from '@tanstack/react-router';
import { H1, H2, Lede, Card, Pill } from '../components/Layout';

export const Route = createFileRoute('/assets')({
  component: AssetsPage,
});

type Asset = { name: string; src: string; dims: string; use: string };

const PROFILE: Asset[] = [
  { name: 'devya-monogram.png', src: '/assets/devya-monogram.png', dims: '1080 × 1080', use: 'Profile picture (kept — current preference). Square fit for FB/IG/LinkedIn.' },
  { name: 'devya-fb-cover.png', src: '/assets/devya-fb-cover.png', dims: '1640 × 856', use: 'Alt Facebook cover (current DEVYA wordmark cover is kept).' },
  { name: 'devya-li-banner.png', src: '/assets/banner/devya-li-banner.png', dims: '1584 × 396', use: 'LinkedIn company + personal banner. Ready for upload.' },
];

const HIGHLIGHTS: Asset[] = [
  { name: 'devya-hl-work.png', src: '/assets/highlights/devya-hl-work.png', dims: '1080 × 1920', use: 'IG Highlight cover · WORK (case studies, shipped products)' },
  { name: 'devya-hl-team.png', src: '/assets/highlights/devya-hl-team.png', dims: '1080 × 1920', use: 'IG Highlight cover · TEAM (founder + engineers)' },
  { name: 'devya-hl-services.png', src: '/assets/highlights/devya-hl-services.png', dims: '1080 × 1920', use: 'IG Highlight cover · SERVICES (what we build)' },
  { name: 'devya-hl-words.png', src: '/assets/highlights/devya-hl-words.png', dims: '1080 × 1920', use: 'IG Highlight cover · WORDS (testimonials, quotes)' },
  { name: 'devya-hl-process.png', src: '/assets/highlights/devya-hl-process.png', dims: '1080 × 1920', use: 'IG Highlight cover · PROCESS (how we ship)' },
];

const CARDS: Asset[] = [
  { name: 'sample-quote (square)', src: '/assets/cards/sample-quote-1080x1080.png', dims: '1080 × 1080', use: 'Founder POV / quote card. Ember accent.' },
  { name: 'sample-quote (landscape)', src: '/assets/cards/sample-quote-1200x630.png', dims: '1200 × 630', use: 'Same quote, FB/LinkedIn feed-optimized.' },
  { name: 'sample-stat (square)', src: '/assets/cards/sample-stat-1080x1080.png', dims: '1080 × 1080', use: 'Stat / by-the-numbers card. Azure accent.' },
  { name: 'sample-stat (landscape)', src: '/assets/cards/sample-stat-1200x630.png', dims: '1200 × 630', use: 'Same stat, landscape variant.' },
  { name: 'sample-tech (square)', src: '/assets/cards/sample-tech-1080x1080.png', dims: '1080 × 1080', use: 'Tech POV / opinion card. Lime accent.' },
  { name: 'sample-tech (landscape)', src: '/assets/cards/sample-tech-1200x630.png', dims: '1200 × 630', use: 'Same tech POV, landscape variant.' },
];

function AssetGrid({ items }: { items: Asset[] }) {
  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map((a) => (
        <a
          key={a.src}
          href={a.src}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-2xl border border-ink-700 bg-ink-850 overflow-hidden hover:border-ember/60 transition-colors hover:no-underline"
        >
          <div
            className="w-full aspect-square bg-ink-900 flex items-center justify-center overflow-hidden"
            style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)', backgroundSize: '16px 16px' }}
          >
            <img src={a.src} alt={a.name} className="max-w-full max-h-full object-contain" loading="lazy" />
          </div>
          <div className="p-4">
            <div className="font-mono text-xs text-ember mb-1">{a.name}</div>
            <div className="text-xs text-ink-400 mb-2">{a.dims}</div>
            <div className="text-sm text-ink-300 leading-snug">{a.use}</div>
          </div>
        </a>
      ))}
    </div>
  );
}

function AssetsPage() {
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Pill tone="azure">Asset library</Pill>
        <Pill tone="mono">All click-to-download</Pill>
      </div>
      <H1>Assets ready to upload.</H1>
      <Lede>
        Every visual ships from <span className="font-mono text-ember">devya-social/assets/</span>. Click any thumbnail to open the full file. PNGs are render-final; SVG sources live alongside if you need to edit.
      </Lede>

      <H2>Profile + brand identity</H2>
      <AssetGrid items={PROFILE} />

      <H2>IG Highlights (mobile-only upload)</H2>
      <Lede>
        Five highlight tray covers at 1080×1920. Upload sequence: PROCESS → WORDS → SERVICES → TEAM → WORK so left-to-right reads WORK first. See <a href="/content">post pipeline</a> for the mobile upload checklist.
      </Lede>
      <div className="mt-4">
        <AssetGrid items={HIGHLIGHTS} />
      </div>

      <H2>Post-card samples (rendered)</H2>
      <Lede>
        Output of the parametric template engine. Edit <span className="font-mono text-ember">templates/posts.json</span> → run <span className="font-mono text-ember">node render-cards.mjs</span> → fresh PNGs land in <span className="font-mono text-ember">assets/cards/</span>.
      </Lede>
      <div className="mt-4">
        <AssetGrid items={CARDS} />
      </div>

      <H2>How to render a new post card</H2>
      <Card>
        <ol className="space-y-3 text-sm list-decimal pl-5">
          <li>
            <span className="text-ink-200 font-semibold">Edit</span>{' '}
            <span className="font-mono text-ember">devya-social/assets/templates/posts.json</span> — append an object with: <span className="font-mono text-ember">slug, kind, label, headline, body</span>.
          </li>
          <li>
            <span className="text-ink-200 font-semibold">kind</span> drives accent color:{' '}
            <span className="font-mono text-ember">quote</span> = ember,{' '}
            <span className="font-mono text-azure">stat</span> = azure,{' '}
            <span className="font-mono text-lime">tech</span> = lime,{' '}
            <span className="font-mono">announcement</span> = ember.
          </li>
          <li>
            Run <span className="font-mono text-ember">node templates/render-cards.mjs</span> from <span className="font-mono text-ember">assets/</span>. Outputs SVG + PNG at both 1080×1080 (IG) and 1200×630 (FB/LinkedIn).
          </li>
          <li>Upload the resulting PNG with the matching caption from <a href="/content">post pipeline</a>.</li>
        </ol>
      </Card>
    </>
  );
}
