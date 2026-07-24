# Safety model and break-glass protocol

Cloudflare Maxxing is read-only by default. A real change needs a second token, a dry run,
explicit approval, and an audited break-glass unlock.

## State isolation

An installed plugin or copied skill stores all local state under:

```text
<host-project>/.cloudflare-maxxing/
```

The directory has its own `.gitignore`, which excludes everything inside it by default.
Cloudflare Maxxing does not read the host project's generic `.env`, add dependencies to its
package manifest, edit its source, or deploy it.

The repository-maintainer workflow uses the equivalent root directories and env files. Both
layouts run the same guarded runtime.

## Three controls

### Separate permissions

Routine commands load only the read token from:

```text
.cloudflare-maxxing/.env.cloudflare
```

The optional edit token is stored separately:

```text
.cloudflare-maxxing/.env.cloudflare.break-glass
```

Child processes receive an allowlisted environment. Routine commands do not inherit
`CF_EDIT_TOKEN` or `CF_ALLOW_DESTRUCTIVE`.

### Break-glass guard

Each bundled action:

- defaults to dry-run;
- refuses `--commit` without both `CF_EDIT_TOKEN` and
  `CF_ALLOW_DESTRUCTIVE=YES_I_AM_SURE`;
- records refused, dry-run, and committed attempts in
  `.cloudflare-maxxing/reports/actions-audit.log`;
- fails closed when the first audit record cannot be written;
- uses a pinned local executable and no shell when a subprocess is required.

Only the action names listed in the installed skill can run through its portable runner.
Ad-hoc API and Wrangler writes are outside the supported path.

### Claude Code tripwire

The plugin's `PreToolUse` hook inspects Bash and Cloudflare Code Mode calls. It blocks:

- recursive deletion of `.cloudflare-maxxing/`;
- direct `DELETE` requests to `api.cloudflare.com`;
- direct cache-purge requests;
- `wrangler delete` and `wrangler remove`;
- write-shaped calls through `mcp__cloudflare__execute`.

It logs Cloudflare-related calls to
`.cloudflare-maxxing/reports/guard-audit.log`. The hook does not block normal edits, builds,
or cleanup in the host project. A skill-only install keeps the script-level break-glass guard
but does not install this Claude hook.

The hook catches obvious bypasses. It does not replace least-privilege tokens or human review.

## Making a real change

1. Name the exact zone or resource, desired value, and reason.
2. Create a short-lived edit token with only the required edit permission.
3. Save it in `.cloudflare-maxxing/.env.cloudflare.break-glass`.
4. Run the allowlisted action without `--commit`.
5. Review the printed plan and wait for explicit approval.
6. Run the same action with `--commit`.
7. Refresh the snapshot and diff the result.
8. Delete the break-glass env file or remove its arming phrase.

Repository maintainers use `.env.break-glass` at the repository root and the matching
`scripts/actions/*` command.

## What counts as a mutation

This includes DNS changes, SSL/TLS and zone-setting edits, WAF or rate-limit changes, cache
purges, Workers or storage deployment and deletion, API-token changes, member or role
changes, zone pause, and DNSSEC toggles.

## Recovery

Snapshots are point-in-time records. Compare the new state with the prior snapshot, review the
local action audit log, and restore the earlier value only through another dry-run and
approved guarded action.
