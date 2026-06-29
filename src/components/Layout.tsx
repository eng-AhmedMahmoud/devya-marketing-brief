import { Link, useLocation } from '@tanstack/react-router';
import { BrandMark } from './BrandMark';
import type { ReactNode } from 'react';

const NAV = [
  { to: '/', label: 'Overview' },
  { to: '/brand', label: 'Brand' },
  { to: '/assets', label: 'Assets' },
  { to: '/content', label: 'Content' },
  { to: '/execute', label: 'Execute' },
  { to: '/strategy', label: 'Strategy' },
  { to: '/decisions', label: 'Decisions' },
];

export function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-ink-700 bg-ink-900/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-6 lg:px-10 py-5 flex items-center justify-between gap-6 flex-wrap">
          <Link to="/" className="hover:no-underline">
            <BrandMark size="md" />
          </Link>
          <nav className="flex items-center gap-1 flex-wrap">
            {NAV.map((n) => {
              const active = pathname === n.to;
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors hover:no-underline ${
                    active
                      ? 'bg-ember/10 text-ember border border-ember/50'
                      : 'text-ink-300 hover:text-ink-100 hover:bg-ink-800 border border-transparent'
                  }`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="flex-1 mx-auto max-w-6xl w-full px-6 lg:px-10 py-12">
        {children}
      </main>
      <footer className="border-t border-ink-700 mt-16">
        <div className="mx-auto max-w-6xl px-6 lg:px-10 py-6 text-xs text-ink-500 flex items-center justify-between gap-4 flex-wrap">
          <span>
            <span className="inline-block w-2 h-2 rounded-full bg-ember mr-2 align-middle" />
            Devya Software Solutions · <a href="https://devya.dev">devya.dev</a> · <a href="mailto:contact@devya.dev">contact@devya.dev</a>
          </span>
          <span className="font-mono">Marketing execution brief · v1</span>
        </div>
      </footer>
    </div>
  );
}

export function H1({ children }: { children: ReactNode }) {
  return <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight mb-3">{children}</h1>;
}

export function H2({ children }: { children: ReactNode }) {
  return <h2 className="text-xl md:text-2xl font-bold mt-12 mb-3 tracking-tight">{children}</h2>;
}

export function Lede({ children }: { children: ReactNode }) {
  return <p className="text-lg text-ink-300 max-w-3xl leading-relaxed">{children}</p>;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-ink-700 bg-ink-850 p-6 md:p-8 ${className}`}>
      {children}
    </div>
  );
}

type PillTone = 'ember' | 'azure' | 'lime' | 'mono' | 'red';
const PILL: Record<PillTone, string> = {
  ember: 'text-ember bg-ember/10 border-ember/60',
  azure: 'text-azure bg-azure/10 border-azure/60',
  lime: 'text-lime bg-lime/10 border-lime/60',
  mono: 'text-ink-300 bg-ink-800 border-ink-700',
  red: 'text-red-400 bg-red-400/10 border-red-400/60',
};
export function Pill({ children, tone = 'mono' }: { children: ReactNode; tone?: PillTone }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-[2px] uppercase border ${PILL[tone]}`}>
      {children}
    </span>
  );
}
