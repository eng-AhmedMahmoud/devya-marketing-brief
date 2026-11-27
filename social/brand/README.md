# Devya brand assets for the social renderers

Copied from the official Devya site (www.devya.dev, repo `eng-AhmedMahmoud/devya-solutions`, `origin/main` at `def94b5`). Never redraw, recolour or edit these; copy them again from the site when the brand changes, then update the pinned values in `social/render/brand.mjs`.

| File | Source in devya-solutions | Notes |
|---|---|---|
| `devya-wordmark.svg` | `public/devya-wordmark.svg` (last changed `2ff4358`, 2026-07-01) | The site header's logo (`components/Logo.tsx`). White (`fill="white"`) wordmark, viewBox 176 × 21. SHA-256 `2c1056e5c572b948e009ca6619be9e7ebf423703dfe0d3cd78f66f9ca2928551`, checked by the tests. |

Colour tokens (in `social/render/brand.mjs`) come from the same commit: `styles/globals.css` `:root` (`--ink-*`, `--accent-silver*`, hairlines) and the `silver` scale in `tailwind.config.ts` (last changed `599eb02`, 2026-11-16).

Rules the renderers enforce (`social/render/brand-check.mjs`, run on every card and video):

- **Logo**: this SVG file only, embedded byte for byte; aspect ratio kept (no stretching); never cropped by the canvas or a parent; no filter, blend mode or reduced opacity (no recolouring); at least 150 px wide, and vector, so it is sharp at output size; clear space of one logo height on every side, free of any other text or shape; contrast with the background behind it at least 7:1.
- **Theme**: black backgrounds (`ink-900` `#08090a`) with silver/grey accents only. Every colour in a template must be a site token, and the rendered pixels must be neutral (no hue): the check fails a card or video frame that shows any colour. Product screenshots are shown in greyscale for the same reason.
