# `.codex/hooks/`

This is the optional Codex tripwire layer of the safety model. It runs before shell commands
and calls to Cloudflare's Code Mode MCP tool.

`guard.mjs` blocks two categories of ad-hoc command, regardless of what the rest of a command
does: `curl`/`Invoke-RestMethod` `DELETE`s against `api.cloudflare.com` or `wrangler ... delete`
outside the audited action scripts, and recursive deletion (`rm -rf`, `Remove-Item -Recurse`)
of `snapshots/`, `reports/`, `reference/`, `.git`, or `.env`. It fails open for everything else,
so it never blocks routine work, and it logs every Cloudflare-touching command it sees to
`reports/guard-audit.log`.

Codex loads the hook from `.codex/hooks.json` after the user trusts the project hook definition.
The commands resolve `guard.mjs` from the Git root on macOS, Linux, and Windows, so the checked-in
configuration contains no machine-specific path.

See `docs/SAFETY.md` for how this fits with permission tiers and the break-glass gate inside the
action scripts.
