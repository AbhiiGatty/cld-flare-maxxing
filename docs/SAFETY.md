# Safety model & break-glass protocol

Posture: **confirm + break-glass.** Reads run freely; any mutation requires confirmation;
destructive operations require an explicit, audited unlock.

## Three layers of defense

1. **Permissions** (`.claude/settings.json`)
   - `allow`: read-only scripts + read-only Cloudflare MCP tools + safe git. This includes
     `mcp__cloudflare__docs` and `mcp__cloudflare__search` (Cloudflare's own "Code Mode" MCP
     server) - both only touch documentation/spec lookups, never the live account.
   - `ask`: action scripts (`scripts/actions/*`), mutating MCP tools (KV/R2/D1 create/delete,
     `d1_database_query`), `git push`, `gh repo/pr create`, raw `curl`/`Invoke-RestMethod`,
     and `mcp__cloudflare__execute` (see below).
   - So Claude must get your approval before anything that can change state.

2. **Break-glass guard** (`scripts/lib/guard.mjs`)
   - Every action script calls `assertBreakGlass()`, which throws unless **both**:
     - `CF_EDIT_TOKEN` is set (in `.env.break-glass`), **and**
     - `CF_ALLOW_DESTRUCTIVE=YES_I_AM_SURE`.
   - Actions are **dry-run by default**; they only mutate with `--commit`.
   - Every attempt (refused, dry-run, or committed) is appended to
     **`reports/actions-audit.log`**. `reports/` is local-only and gitignored, so this
     trail lives only on your machine — it no longer rides along in git history. If you
     want a durable off-machine record, back the file up yourself.
   - Break-glass fails closed: an action cannot arm if the initial audit record cannot be
     written.
   - Dependency installs and builds run before the edit token is loaded. Mutation
     subprocesses use a pinned local Wrangler executable without a shell and receive a
     minimal environment instead of inheriting the parent process.

3. **Tripwire hook** (`.claude/hooks/guard.mjs`, PreToolUse on `Bash` and on
   `mcp__cloudflare__execute`)
   - **Blocks** catastrophic *ad-hoc* commands that bypass the audited path:
     - `curl`/`Invoke-RestMethod` `DELETE` against `api.cloudflare.com`
     - `wrangler ... delete`/`remove`
     - an `mcp__cloudflare__execute` call whose generated code reads as a live
       `DELETE`/`purge_cache` against the API (`cloudflare.request("DELETE", ...)` and
       similar) - this server runs agent-written JavaScript against the whole Cloudflare
       API instead of exposing fixed named tools, so there's no per-call read/write split
       upstream of this hook to lean on
     - recursive deletion (`rm -rf`, `Remove-Item -Recurse`) of `snapshots/`, `reports/`,
       `reference/`, `secrets/` (the alias vault), `config/` (real curated data), `.git`,
       or `.env`
   - Logs all Cloudflare-touching commands and `execute` calls to `reports/guard-audit.log`.
   - Fails **open** for everything else (never bricks routine work) - it catches the obvious
     catastrophic shape, not every possible destructive call. `execute` calls that don't match
     (a `PUT` that edits a zone setting, say) still stop at the `ask` prompt in layer 1; they
     just don't get a hard block on top of it the way a `DELETE` does.
   - To disable temporarily: remove the `PreToolUse` block from `.claude/settings.json`.

### `mcp__cloudflare__execute` and OAuth scope
`.mcp.json` also wires in Cloudflare's own primary MCP server (`mcp.cloudflare.com`, "Code
Mode"), which extends live read coverage to zone, DNS, WAF, SSL, and rate-limit state.
Unlike `CF_READ_TOKEN`/`CF_EDIT_TOKEN`, which
this repo issues itself with a chosen scope, this server authenticates via **OAuth** - the
permission it actually gets is whatever you approve on Cloudflare's own consent screen the
first time it's used, not something this repo can force to read-only from its side. Choose a
read-only grant there if offered one. The `ask` gate plus the hard `DELETE`/`purge_cache` block
above are the compensating controls on this repo's side; they don't depend on the OAuth scope
being minimal. Route every actual mutation through `scripts/actions/*` + break-glass regardless
of what the OAuth grant would technically allow.

## Break-glass protocol (making a real change)

1. Decide the exact change and which zone/resource it affects.
2. Create/scope an **edit token** (`docs/TOKEN-SETUP.md`).
3. `Copy-Item .env.break-glass.example .env.break-glass` and fill in:
   ```
   CF_EDIT_TOKEN=...
   CF_ALLOW_DESTRUCTIVE=YES_I_AM_SURE
   ```
4. Run the action **dry-run first** (default), review the printed plan.
5. Re-run with `--commit` to apply.
6. **Delete `.env.break-glass`** (or at least unset `CF_ALLOW_DESTRUCTIVE`) when done.
7. Run `npm run refresh` to capture the new state, and `npm run diff` to confirm the change.

## What's considered destructive
DNS edits/deletes · SSL-TLS mode & zone settings · WAF/firewall/rate-limit rules ·
KV/R2/D1/Workers/Pages deletes · cache purge · API token create/revoke · member/role changes ·
zone pause · DNSSEC toggles.

## Recovery
- Every snapshot is a point-in-time record under `snapshots/<stamp>/`. To understand or
  reverse a change, diff against an earlier snapshot (`node scripts/diff.mjs <old> <new>`)
  and reapply the prior values via a guarded action.
- The action audit log (`reports/actions-audit.log`) records what this tool changed and when.
  It's local-only (see above), so it survives exactly as long as your local `reports/` folder does.
