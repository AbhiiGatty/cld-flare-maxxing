# Account and Access settings review

**What:** Enabled account membership 2FA after verifying that every accepted
member had enrolled. Narrowed the Social Desk MCP Access exception from
`/mcp*` to `/mcp`, which also covers child paths.

**Why:** The owner asked for account health checks and safe settings cleanup.
The two critical Access recommendations flag intentional public entry points.
Metrics accepts public telemetry with project/origin checks and Cloudflare
rate-limit bindings. Social Desk validates hashed, expiring, account-scoped
tokens before exposing MCP tools. Requiring interactive Access on these paths
would break their intended clients.

**Outcome:** The 2FA requirement was verified through the API and dashboard.
Social Desk still returns 401 for anonymous or invalid-token MCP requests,
and its upload route rejects a missing one-time upload token. `/mcp-admin`
now redirects to Access, as does the dashboard. The wildcard previously
returned only a static application shell at that sibling path; no private
data exposure was established. Claude independently reviewed the findings
and recommended narrowing the path.

**Lesson:** Treat the remaining bypass warnings as documented exceptions,
not repaired authentication defects. Public telemetry can still receive
spoofed events from non-browser clients; origin checks are not authentication.
Review the exception when routes or authentication change. The account owner
owns this decision; review again by 2026-12-15. The initial 2FA PUT echoed an
old account name that the API now rejects; sending only the settings preserved
the name and successfully enabled the requirement.
