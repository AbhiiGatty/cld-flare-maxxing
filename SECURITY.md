# Security policy

## Reporting a vulnerability

If you find a security problem in this framework — a way to make an action script mutate
without break-glass, a path that leaks real account data into the committed tree, a flaw in
the pseudonymization in `scripts/lib/idmap.mjs`, anything of that shape — please report it
privately rather than opening a public issue.

Use GitHub's private vulnerability reporting on this repository ("Security" tab → "Report a
vulnerability"). If that option is unavailable, email
[hello@abhiigatty.com](mailto:hello@abhiigatty.com) with the subject
`cld-flare-maxxing security report`. Do not attach tokens, raw snapshots, or the alias vault.
You'll get a response within a few days.

## Scope

In scope:
- The break-glass guard (`scripts/lib/guard.mjs`) and action scripts (`scripts/actions/*`)
- The pseudonymization engine (`scripts/lib/idmap.mjs`) — anything that would let someone
  reverse a committed alias without the salt and vault, or that leaks real values into
  `snapshot.public.json`
- The tripwire hooks (`.claude/hooks/guard.mjs` and `.codex/hooks/guard.mjs`)
- The capture-time secret redaction (`redact()` in `scripts/lib/util.mjs`)

Out of scope:
- Vulnerabilities in Cloudflare's own products or APIs (report to Cloudflare)
- Issues requiring a compromised local machine or a leaked `.env`

## What this project already assumes

Committed snapshots are pseudonymized, not encrypted: deterministic aliases with the salt
and alias vault kept only on the owner's machine. Token values are never written into any
snapshot. Every destructive action requires a separate edit token plus an explicit
`CF_ALLOW_DESTRUCTIVE=YES_I_AM_SURE`, and defaults to a dry run. See `docs/SAFETY.md` and
`docs/SHARING.md` for the full model.
