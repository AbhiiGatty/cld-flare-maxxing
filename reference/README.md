# reference/

Curated, hand-maintained knowledge, not account data. This is what `scripts/report.mjs` and
`scripts/betas.mjs` check your snapshot against. Committed on purpose, generic to any
Cloudflare account, and part of the shareable framework (see `docs/SHARING.md`).

| File | What it is |
|---|---|
| `heuristics-catalog.json` | the 61-check catalog `scripts/report.mjs` runs against a snapshot |
| `limits.json` | 43 plan limits, used to compute utilization percentages |
| `betas.json` | 19 beta/early-access features, scored against your stack by `scripts/betas.mjs` |
| `api-map.json` | the 33 Cloudflare API endpoints the snapshot collector uses, with verified phase names and notes |

To add a new check: add an entry here and a matching computation in `scripts/report.mjs` that
calls `flag('<id>', resource, evidence)`. See "Extending" in `docs/ARCHITECTURE.md`.
