# Token setup (two-token model)

You create **two** Cloudflare API tokens. The read token does all routine work; the edit
token only exists when you're deliberately making a change.

Create tokens at: **Cloudflare dashboard → My Profile → API Tokens → Create Token**
(URL: https://dash.cloudflare.com/profile/api-tokens)

---

## 1. Read-only token  →  `.env`  (`CF_READ_TOKEN`)

**Easiest:** use the built-in template **“Read all resources.”** It grants read across the
account and all zones — exactly what snapshots/reports need — and nothing can be mutated with it.

If you prefer a custom token, grant these **Read** permissions:

| Scope | Permissions (Read) |
|---|---|
| Account | Account Settings, Account Analytics, **Audit Logs**, Workers Scripts, Workers KV Storage, Workers R2 Storage, D1, Workers Queues, Cloudflare Pages, Account Rulesets, Billing |
| Zone | Zone, DNS, Zone Settings, SSL and Certificates, Firewall Services, Page Rules, Zone WAF, Cache Rules, Analytics, Workers Routes |
| User | User Details, API Tokens, Memberships |

- **Account Resources:** Include → your account.
- **Zone Resources:** Include → All zones (from the account).
- **Client IP / TTL:** optional. Recommend setting an expiry and rotating.

> Notes
> - `/user`, `/user/tokens`, and member 2FA fields only resolve for a **user-scoped** token
>   (not an "Account-Owned" token). Use a user token for full coverage of the Resources tab.
> - The snapshot **degrades gracefully**: any scope you omit just records an entry in
>   `snapshot.errors` and the rest still runs.

Then:
```
copy .env.example .env        # (PowerShell: Copy-Item .env.example .env)
# edit .env → CF_READ_TOKEN=...   and optionally CF_ACCOUNT_ID=...
npm run setup                 # verifies the token reaches the API
```

---

## 2. Edit / break-glass token  →  `.env.break-glass`  (`CF_EDIT_TOKEN`)

Only needed when you intend to **change** the account. Keep it scoped tight and prefer to
**delete `.env.break-glass` after use**.

Grant **Edit** only for what you actually manage, e.g.:

| Scope | Permissions (Edit) |
|---|---|
| Zone | DNS, Zone Settings, SSL and Certificates, Firewall Services, Zone WAF, Page Rules, Cache Purge, Workers Routes |
| Account | Workers Scripts, Workers KV Storage, Workers R2 Storage, D1, Cloudflare Pages |

- **Zone Resources:** prefer **specific zones** over "All zones."
- Do **not** add `API Tokens: Edit` or `Memberships: Edit` unless you truly need them
  (those enable privilege escalation).
- Set a short expiry.

Then, only at the moment of change:
```
copy .env.break-glass.example .env.break-glass
# edit → CF_EDIT_TOKEN=...  and  CF_ALLOW_DESTRUCTIVE=YES_I_AM_SURE
node scripts/actions/dns-create-record.mjs --zone=example.com --type=A --name=test --content=192.0.2.10   # dry-run
# add --commit when you're sure
```

See `docs/SAFETY.md` for the full break-glass protocol and what's blocked.

---

## 3. Live MCP servers (separate from the two tokens above)

`.mcp.json` wires in Cloudflare's own remote MCP servers (bindings, builds, observability,
docs, dns-analytics, graphql, radar, and the primary `cloudflare` "Code Mode" server). These
authenticate via **OAuth**, triggered automatically the first time a Cloudflare MCP tool is
used - there's nothing to create or paste into a file, unlike `CF_READ_TOKEN`/`CF_EDIT_TOKEN`.

If Cloudflare's OAuth consent screen offers a choice of permissions, pick read-only - this repo
can't force that scope from its side. See `docs/SAFETY.md` for how `mcp__cloudflare__execute`
(the one server here with no fixed tool list) is gated regardless of what the OAuth grant allows.

Using an agent other than Claude Code? These same MCP servers, plus Cloudflare's own Skills
plugin bundle, install with one command per agent -
[developers.cloudflare.com/agent-setup/prompt.md](https://developers.cloudflare.com/agent-setup/prompt.md)
has the exact config for Codex, OpenCode, Windsurf, Cursor, and Copilot. Claude Code users get
the MCP servers automatically from this repo's own `.mcp.json`; the Skills bundle is a separate,
optional install (`claude plugin install cloudflare@cloudflare`) for hands-on Workers/D1/R2
development alongside this repo's own governance tooling.
