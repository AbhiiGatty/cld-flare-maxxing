# Cloudflare's own agent-setup release: checked for obsolescence, then integrated the gap

**What:** Cloudflare published `developers.cloudflare.com/agent-setup/prompt.md`, an official
one-command installer for MCP servers plus a Skills plugin bundle. Investigated whether this
renders the whole repo redundant. It doesn't. Then added the one server this repo was
actually missing (the primary `cloudflare` "Code Mode" server), with a new compensating
guardrail rather than just dropping it in.

**Why (the obsolescence check):** `.mcp.json` already wired in 6 of the 7 servers the official
doc lists, plus 3 more it doesn't (`dns-analytics`, `graphql`, `radar`) - this repo was already
built as a layer on top of Cloudflare's own MCP servers, not a competitor to them. What the
official release doesn't provide and this repo does: committed/versioned point-in-time
snapshots, diffing across time, audit-log change attribution, a 61-check findings engine, a
dashboard, and a hard `CF_READ_TOKEN`/`CF_EDIT_TOKEN` split with an audited dry-run-first
break-glass flow. Their Skills bundle is for a different job entirely (authoring new Workers/
D1/R2 apps, not governing an existing account).

**Why (the guardrail extension):** The one real gap, the primary `cloudflare` server, is
fundamentally different from every other MCP server already in use here: it has no fixed tool
list. It exposes exactly three tools (`docs`, `search`, `execute`), where `execute` runs
agent-written JavaScript against the live API. That means there's no way to classify
individual "operations" as read-only vs. mutating at the permission-config level the way
`cloudflare-bindings`' `kv_namespace_delete` vs. `kv_namespaces_list` can be - any `execute`
call could be anything. Set `docs`/`search` to auto-allow (spec-only, never touch the live
account) and `execute` to require approval (same tier as raw `curl`), then extended the
existing Bash-only guard hook to also fire on `mcp__cloudflare__execute` and hard-block any
generated call whose code reads as a live `DELETE`/`purge_cache`, mirroring the protection
already in place for ad-hoc `curl`/`wrangler` mutation attempts.

**Outcome:** Shipped. Tested the hook with synthetic input for both paths (Bash and the new
MCP tool) before merging: benign reads allowed, DELETE-shaped calls blocked, an armed guarded
action still allowed, a non-DELETE write (a `PUT`) allowed through *this* hook by design
(it still stops at the `ask` permission prompt in settings.json - the hook only hard-blocks
the most catastrophic shape, matching how the pre-existing Bash-path guard already worked).

**Lesson:** When a request is "did $EXTERNAL_THING make part of this obsolete," resist
answering from vibes - check the repo's actual existing integration points first (here,
`.mcp.json` already answered most of the question before any web research was needed). And
when a new MCP server has a fundamentally different shape (code-execution vs. fixed tools)
from the ones a guard hook was written against, check whether the hook's matching logic
(here, `PreToolUse` on `Bash` specifically) actually covers the new tool at all before
assuming existing protections extend to it automatically. They don't, by default.
