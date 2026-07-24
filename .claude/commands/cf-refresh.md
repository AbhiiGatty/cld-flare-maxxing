---
description: Capture a fresh Cloudflare snapshot, regenerate the report + beta advisor, and rebuild the dashboard data.
allowed-tools: Bash(npm run refresh:*), Bash(node scripts/snapshot.mjs:*), Bash(node scripts/report.mjs:*), Bash(node scripts/betas.mjs:*), Bash(node scripts/build-dashboard-data.mjs:*)
---

Run `npm run refresh` (snapshot → report → betas → dashboard data) using the read-only token.

Then summarize for me:
- The counts (zones, DNS records, workers, etc.) and any collectors that were skipped (`snapshot.errors`).
- The top critical/high findings with their recommended fixes.
- Any plan limits at or above 80% utilization.
- Notable recent sensitive changes from the audit log (who did what).

Do NOT make any changes to the account — this is read-only.
