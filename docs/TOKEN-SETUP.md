# Token setup

Start with one read-only token. It handles setup, snapshots, reports, diffs, recommendations,
and the dashboard. Do not create an edit token during normal setup.

Create tokens at
[Cloudflare dashboard > My Profile > API Tokens](https://dash.cloudflare.com/profile/api-tokens).

## Read-only token

Use Cloudflare's built-in **Read all resources** template. It grants the broad read coverage
needed for a complete account snapshot without granting write access.

If you prefer a custom token, grant these read permissions:

| Scope | Permissions |
|---|---|
| Account | Account Settings, Account Analytics, Audit Logs, Workers Scripts, Workers KV Storage, Workers R2 Storage, D1, Workers Queues, Cloudflare Pages, Account Rulesets, Billing |
| Zone | Zone, DNS, Zone Settings, SSL and Certificates, Firewall Services, Page Rules, Zone WAF, Cache Rules, Analytics, Workers Routes |
| User | User Details, API Tokens, Memberships |

Include the intended account and all zones you want inspected. An expiry and client-IP
restriction are optional but useful.

Some user and token metadata is available only to a user-scoped token. If a permission is
missing, the snapshot records that collector's error and continues.

### Plugin or skill install

The agent creates:

```text
<host-project>/.cloudflare-maxxing/.env.cloudflare
```

Add the token locally:

```dotenv
CF_READ_TOKEN=replace_me
# CF_ACCOUNT_ID=optional_account_id
```

Never paste the token into chat. The host project's generic `.env` is unrelated and is not
read by this tool.

Then ask the agent to verify access, or run:

```bash
node "<skill-path>/scripts/cf-maxxing.mjs" setup
```

### Repository maintainer workflow

A contributor running the repository's root scripts uses the legacy root `.env` path:

```powershell
Copy-Item .env.example .env
npm run setup
```

That path exists for developing and testing this repository. It is not used by an installed
plugin or copied skill.

## Optional edit token

Create this token only after choosing a specific change and reviewing its dry run. Grant edit
permission only for the named resource and prefer one specific zone over all zones.

Common edit scopes are:

| Scope | Permissions |
|---|---|
| Zone | DNS, Zone Settings, SSL and Certificates, Firewall Services, Zone WAF, Page Rules, Cache Purge, Workers Routes |
| Account | Workers Scripts, Workers KV Storage, Workers R2 Storage, D1, Cloudflare Pages |

Do not grant API Tokens: Edit or Memberships: Edit unless the approved change requires them.
Use a short expiry and remove the local file after the change.

For a plugin or skill install, create:

```text
<host-project>/.cloudflare-maxxing/.env.cloudflare.break-glass
```

with:

```dotenv
CF_EDIT_TOKEN=replace_me
CF_ALLOW_DESTRUCTIVE=YES_I_AM_SURE
```

Run the action without `--commit`, state the exact change, and wait for explicit approval.
Only then rerun it with `--commit`.

Repository maintainers use `.env.break-glass` at the repository root for the same guarded
flow.

Read [SAFETY.md](SAFETY.md) for the full protocol.

## Optional Cloudflare tools

Cloudflare's documentation and API tools can complement this package. They are not required
for setup, snapshots, reports, diffs, or the dashboard. Use
[Cloudflare's current agent setup](https://developers.cloudflare.com/agent-setup/) rather
than copying an old server list.
