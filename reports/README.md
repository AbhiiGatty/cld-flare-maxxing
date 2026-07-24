# reports/

Generated output, local-only. Everything in this folder is derived from `snapshots/` plus
`reference/`, gitignored, and safe to delete: `npm run report` (or `npm run refresh`) rebuilds
it from scratch. This file is the one exception, kept in git so a fresh clone still explains
what belongs here.

| File pattern | Produced by | What it is |
|---|---|---|
| `<stamp>-report.json` / `.md` | `scripts/report.mjs` | one dated findings report (heuristic results, limit utilization, audit-log attribution) |
| `latest-report.json` | `scripts/report.mjs` | pointer to the most recent report, what the dashboard and agents read by default |
| `betas.json` | `scripts/betas.mjs` | beta-feature fit scores for the current account |
| `actions-audit.log` | every guarded action script (`scripts/lib/guard.mjs`) | every break-glass attempt: refused, dry-run, or committed |
| `guard-audit.log` | the `.claude/hooks/guard.mjs` tripwire | every Cloudflare-touching shell command it saw |

Why local-only: this data is fully regenerable from `snapshots/` (which *is* committed), so
keeping it out of git avoids a growing, un-diffable history of findings without losing anything
irreplaceable. See `docs/SAFETY.md` for how the audit log fits into the break-glass model now
that it doesn't ride along in git history.
