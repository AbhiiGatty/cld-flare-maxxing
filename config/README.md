# config/

Generated/curated config files that aren't secrets and aren't account snapshots, so they live
outside `snapshots/` and `reports/`. All three below name real zones, projects, or account/zone
ids, so — like `snapshots/*/snapshot.json` — they're gitignored and local-only; only this
README is committed. Every script that reads them (`build-actions.mjs`, `build-dashboard-data.mjs`)
falls back to an empty/absent value if the file doesn't exist yet, so a fresh clone works fine
with none of these present.

| File | What it is |
|---|---|
| `token-capabilities.json` | probed read/edit capability matrix for the current tokens, per service (DNS, WAF, rate-limit, DNSSEC, etc.). Regenerate with `npm run capabilities`. |
| `backlog.json` | the verified action backlog that drives the dashboard's Action Center (todo/in-progress/done items found across audits). Built by `scripts/build-actions.mjs` into `dashboard/public/data/actions.json`. |
| `backlog-curated.json` | the hand-written, non-finding action catalog (customer-value/perf/cost/session work) that used to be hardcoded in `scripts/build-actions.mjs` — moved out because that script is meant to be shareable framework code with no account data in it. |
