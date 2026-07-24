# dashboard/src/components/

| File | What it renders |
|---|---|
| `ui.jsx` | shared UI primitives (cards, badges, pills, tables) used across every tab |
| `charts.jsx` | the chart components (limit utilization, findings by severity, etc.) |
| `actions.jsx` | the Action Center panel, reading `dashboard/public/data/actions.json` |
| `ui/` | shadcn/ui components (TypeScript), not `ui.jsx` above - only wired into the `demo.html` sandbox, not the real dashboard |
