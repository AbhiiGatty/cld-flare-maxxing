# Token setup (read first, edit only when needed)

Start with **one read-only token**. It handles setup, snapshots, reports, diffs, and the
dashboard. Do not create an edit token during normal setup.

The second token is optional. Create it only when you have chosen a specific account change,
reviewed its dry run, and are ready to use break-glass.

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

## 2. Optional edit / break-glass token  →  `.env.break-glass`  (`CF_EDIT_TOKEN`)

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

## 3. Optional live MCP servers

`.mcp.json` contains Cloudflare's API Code Mode server and documentation server. They are
optional and are not used by `npm run setup`, `npm run refresh`, reports, diffs, or the
dashboard. The API server authenticates with **OAuth** the first time it is used.

If Cloudflare's OAuth consent screen offers a choice of permissions, pick read-only - this repo
can't force that scope from its side. See `docs/SAFETY.md` for how `mcp__cloudflare__execute`
(the one server here with no fixed tool list) is gated regardless of what the OAuth grant allows.

Cloudflare also publishes an optional Skills plugin for hands-on Workers, D1, R2, and Durable
Objects development. It complements this account-governance repository but is not required.
Use [Cloudflare's current agent setup](https://developers.cloudflare.com/agent-setup/) for the
latest install instructions.
