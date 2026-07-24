# dashboard/src/components/ui/

shadcn/ui-style components (TypeScript, `@/lib/utils`'s `cn`). Only reachable from the
`demo.html` sandbox (`src/demo-main.tsx`), not from the real dashboard's `App.jsx`.

| File | What it is |
|---|---|
| `bloim-animation-background.tsx` | full-bleed WebGL scene via `unicornstudio-react`, remote content fetched at runtime from `assets.unicorn.studio` by `projectId` - not self-hosted, not under version control |
| `demo.tsx` | minimal usage example (`DemoOne`), mounted by `src/demo-main.tsx` |
