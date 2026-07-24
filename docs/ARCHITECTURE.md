# Architecture

## Data flow
```
Cloudflare API (read token)                 reference/ (curated, from research)
        │                                      ├─ heuristics-catalog.json (61 checks)
        ▼                                      ├─ limits.json (43 plan limits)
  scripts/snapshot.mjs ──► snapshots/<stamp>/snapshot.json (local, real data) ├─ betas.json (19 features)
        │                       │        └─► scripts/lib/idmap.mjs ──► snapshot.public.json (committed, aliased)
        │                       │                            └─ api-map.json (33 endpoints)
        │                       ├──► scripts/report.mjs ──► reports/latest-report.json (+ .md)
        │                       ├──► scripts/betas.mjs  ──► reports/betas.json
        │                       └──► scripts/diff.mjs   ──► reports/latest-diff.json
        ▼
  scripts/build-dashboard-data.mjs ──► dashboard/public/data/dashboard.json (local, gitignored)
        ▼
  dashboard/ (React + Vite) ── reads dashboard.json ──► unified UI
```
`report.mjs`/`diff.mjs`/`betas.mjs`/`build-dashboard-data.mjs` all read the local `snapshot.json`
(real data) — only the `snapshot.public.json` sibling produced by `idmap.mjs` is committed.

## File map
| Path | Purpose |
|---|---|
| `scripts/lib/cf.mjs` | REST + GraphQL client; read/edit token modes; pagination; retries |
| `scripts/lib/guard.mjs` | break-glass enforcement + action audit log |
| `scripts/lib/paths.mjs` | paths + `snapshots/index.json` bookkeeping (latest pointer) |
| `scripts/lib/util.mjs` | env loader, JSON IO, redaction, logging |
| `scripts/lib/idmap.mjs` | deterministic alias engine — real → pseudonymized, + the local vault |
| `scripts/snapshot.mjs` | full account+zone read snapshot (resilient per-collector) |
| `scripts/alias-existing.mjs` | backfill `snapshot.public.json` for pre-existing local snapshots |
| `scripts/resolve.mjs` | alias ↔ real value lookup against the local vault |
| `scripts/report.mjs` | runs computable heuristics, limit utilization, attribution |
| `scripts/diff.mjs` | diff two snapshots + correlate audit-log actors |
| `scripts/betas.mjs` | scores reference betas against your account signals |
| `scripts/build-dashboard-data.mjs` | consolidates everything into one dashboard JSON |
| `scripts/actions/*` | guarded mutating actions (dry-run default, break-glass) |
| `reference/*` | curated knowledge: heuristics, limits, betas, API map |
| `snapshots/` | `snapshot.json` local/real (gitignored) + **committed** pseudonymized `snapshot.public.json` |
| `reports/`, `config/*.json`, `secrets/` | **local-only** (gitignored): reports, real curated config, the alias vault |
| `dashboard/` | React/Vite single-page dashboard |
| `.mcp.json` | optional Cloudflare API and documentation MCP servers (OAuth) |
| `.claude/` | permission tiers + tripwire hook (Claude Code-specific guardrails) |
| `.claude/experiences/` | decision log: what was tried, why, and whether it got reversed - read before a key decision, write one after, any agent |
| `AGENTS.md` | harness-neutral operating contract, for any AI coding harness |
| `CLAUDE.md` | same contract plus Claude Code-specific extras (skills, agents, tone) |

## Snapshot schema (`snapshots/<stamp>/snapshot.json`)
`account`, `user`, `subscriptions`, `members`, `roles`, `tokens` (metadata only),
`resources` (workers/kv/r2/d1/queues/pages), `zones[]` (settings map, dnssec, ssl_mode,
dnsRecords, certificatePacks, waf{custom,managed,rateLimit}, cacheRules, pageRules,
workersRoutes, securityEvents), `auditLog[]` (normalized actor/action/resource/when/interface),
`counts`, `errors` (skipped collectors).

## Coverage notes
- WAF/rate-limit/cache use the **ruleset engine** entrypoints (verified phase names in
  `reference/api-map.json`): `http_request_firewall_custom`, `http_request_firewall_managed`,
  `http_ratelimit`, `http_request_cache_settings`.
- Audit logs use the **current v2 endpoint** `/accounts/{id}/logs/audit` (requires `since`/`before`).
- Security events use the GraphQL `firewallEventsAdaptiveGroups` dataset.
- The optional MCP configuration contains Cloudflare's API Code Mode server and documentation
  server. The local REST snapshot does not depend on them. The API server authenticates with
  OAuth and has no fixed endpoint tool list, so `execute` requires approval and is hook-checked
  for DELETE and purge patterns before it runs (`docs/SAFETY.md`).

## Extending
- **New check:** add an entry to `reference/heuristics-catalog.json` and a computation in
  `scripts/report.mjs` that calls `flag('<id>', resource, evidence)`.
- **New action:** copy a file in `scripts/actions/`, call `bootEdit()` + `parseArgs()`, keep
  dry-run default. Add its `node scripts/actions/...` prefix to `.claude/settings.json` `ask`.
- **New dashboard panel:** add a tab in `dashboard/src/App.jsx` reading from `dashboard.json`.
