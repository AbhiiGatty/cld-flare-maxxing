# scripts/

The read-only pipeline: snapshot → report → betas → dashboard data. Every script here is safe
to run anytime; nothing under `scripts/` mutates the Cloudflare account except what's inside
`actions/`.

| File | `npm run` | What it does |
|---|---|---|
| `snapshot.mjs` | `snapshot` | full read-only account/zone snapshot, resilient per-collector |
| `report.mjs` | `report` | runs the heuristic catalog, computes limit utilization and audit-log attribution |
| `betas.mjs` | `betas` | scores `reference/betas.json` against the account's actual signals |
| `diff.mjs` | `diff` | diffs two snapshots and correlates audit-log actors |
| `build-dashboard-data.mjs` | `build-data` | consolidates everything into `dashboard/public/data/dashboard.json` |
| `build-actions.mjs` | `actions` | builds `dashboard/public/data/actions.json` from `config/backlog.json` |
| `capabilities.mjs` | `capabilities` | probes and records what the current tokens can actually read/edit |
| `setup.mjs` | `setup` | creates `.env` from `.env.example` and verifies the read token reaches the API |
| `sanitize.mjs` | `sanitize` | strips real snapshots/reports, resets to the generic sample, for sharing |
| `actions/` | — | guarded mutating actions, dry-run default, break-glass to commit, see `actions/README.md` |
| `lib/` | — | the shared library every script above is built on, see `lib/README.md` |
