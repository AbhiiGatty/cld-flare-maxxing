---
name: "source-command-cf-refresh"
description: "Capture a fresh Cloudflare snapshot, regenerate the report + beta advisor, and rebuild the dashboard data."
---

# source-command-cf-refresh

Use this skill when the user asks to run the migrated source command `cf-refresh`.

## Command Template

Run `npm run refresh` (snapshot → report → betas → dashboard data) using the read-only token.

Then summarize for me:
- The counts (zones, DNS records, workers, etc.) and any collectors that were skipped (`snapshot.errors`).
- The top critical/high findings with their recommended fixes.
- Any plan limits at or above 80% utilization.
- Notable recent sensitive changes from the audit log (who did what).

Do NOT make any changes to the account — this is read-only.
