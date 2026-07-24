# dashboard/src/

The dashboard's React source.

| Path | What it is |
|---|---|
| `App.jsx` | top-level component: layout, tabs, and data loading |
| `styles.css` | the dashboard's theme (dark base, Cloudflare-orange accent), shared visual language with `site/`, see `docs/DESIGN-SYSTEM.md` |
| `main.jsx` | React entry point for the real dashboard (`index.html`) |
| `components/` | the tab/panel components plus `components/ui/`, see `components/README.md` |
| `lib/` | data-loading helpers plus `lib/utils.ts` (shadcn's `cn`), see `lib/README.md` |
| `index.css` | Tailwind + shadcn/ui tokens, only loaded by `demo-main.tsx` - never imported by `main.jsx`, so the hand-rolled `styles.css` above is unaffected |
| `demo-main.tsx` | React entry point for the sandbox (`demo.html`) |
| `vite-env.d.ts` | ambient types for Vite (asset/CSS imports), needed once TypeScript entered the project |
