# Devya · Marketing Execution Brief

Internal site for the Devya marketing team. Brand canon, asset library, content pipeline, execution checklist, strategy roadmap, and parked decisions.

## Stack

- Vite + React 19 + TypeScript
- TanStack Router (file-based)
- Tailwind CSS v4

## Dev

```bash
pnpm install
pnpm dev   # http://localhost:5173
pnpm build # static build into dist/
```

## Deploy

Connected to Vercel; auto-deploys on push to `main`.

## Source content

Everything in this site mirrors the canonical source-content folder (kept outside this repo):

- `STATUS.md` — single source of truth
- `ROADMAP.md` — 6-phase plan
- `briefs/` — per-channel execution briefs
- `posts/batch-1.md`, `batch-2.md`, `batch-3.md` — post copy
- `assets/` — render-final PNGs + SVG sources + card template engine
