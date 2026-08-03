# Social Desk MCP Access boundary

**What:** Added a guarded, idempotent action for a more-specific
`social.gattyworks.com/mcp*` Access application with an Everyone Bypass policy.

**Why:** Codex and other MCP clients cannot complete an interactive Cloudflare
Access login. Social Desk now issues its own one-time-visible, hashed,
account-scoped bearer tokens, so the MCP path must reach the Worker directly
while the rest of the dashboard stays behind exact-email Access.

**The why, as given:** The owner wants another user's AI to send draft media and
copy into Social Desk for human review without giving that AI publishing power.

**Outcome:** Only `/mcp*` bypasses Access. The Worker rejects missing, invalid,
revoked, or expired Social Desk tokens and exposes draft-only tools. Public
publishing still requires the existing human approval flow.

**Lesson:** Put the machine-authenticated endpoint in a more-specific Access
application. Do not weaken the identity policy on the dashboard's root app.
