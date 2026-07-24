# .claude/hooks/

The third layer of the safety model: a `PreToolUse` hook on every Bash call.

`guard.mjs` blocks two categories of ad-hoc command, regardless of what the rest of a command
does: `curl`/`Invoke-RestMethod` `DELETE`s against `api.cloudflare.com` or `wrangler ... delete`
outside the audited action scripts, and recursive deletion (`rm -rf`, `Remove-Item -Recurse`)
of `snapshots/`, `reports/`, `reference/`, `.git`, or `.env`. It fails open for everything else,
so it never blocks routine work, and it logs every Cloudflare-touching command it sees to
`reports/guard-audit.log`.

Wired into `.claude/settings.json`. See `docs/SAFETY.md` for how this fits with the other two
layers (permission tiers, and the break-glass gate inside the action scripts themselves).
