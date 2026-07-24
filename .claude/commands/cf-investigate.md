---
description: Investigate a question about the Cloudflare account using the latest snapshot, reports, and read-only MCP tools.
---

Investigate the following about my Cloudflare account: $ARGUMENTS

Use, in order of preference:
1. The latest snapshot (`snapshots/` via `snapshots/index.json`) and `reports/latest-report.json`.
2. `reports/latest-diff.json` and the snapshot `auditLog` for "who/when" change attribution.
3. Read-only Cloudflare MCP tools and `cloudflare-docs` search for anything not in the snapshot.

If the data is stale, offer to run `npm run refresh` first (read-only). Present findings with
concrete evidence (zone, record, setting, actor, timestamp) and, where relevant, the exact
guarded action that would remediate it — but do NOT make any change without my explicit go-ahead
and the break-glass protocol (docs/SAFETY.md).
