# scripts/actions/

Every script here can change the live Cloudflare account. All of them share the same shape:
dry-run by default, `--commit` to apply, and they refuse to mutate unless break-glass is armed
(`CF_EDIT_TOKEN` set and `CF_ALLOW_DESTRUCTIVE=YES_I_AM_SURE`), enforced by
`scripts/lib/guard.mjs`. An action cannot arm unless its audit record is written to
`reports/actions-audit.log`.

Dependency installs and builds run before the edit token is loaded. Mutation subprocesses use
the pinned Wrangler in the relevant lockfile, never invoke a shell, and receive a minimal
environment containing the scoped Cloudflare credential instead of the full parent process.

| File | What it does |
|---|---|
| `dns-create-record.mjs` | create a DNS record on a zone |
| `dns-delete-record.mjs` | delete a DNS record from a zone |
| `security-baseline.mjs` | bring SSL mode, DNSSEC, and HSTS up to the recommended baseline |
| `waf-managed-deploy.mjs` | deploy the account's Cloudflare Managed Ruleset onto a zone |
| `purge-cache.mjs` | purge a zone's cache |
| `pages-deploy-site.mjs` | deploy `site/` to Cloudflare Pages and attach its custom domain |
| `pages-git-auto-deploy-toggle.mjs` | enable or disable automatic production and preview deploys from a connected Git repository |
| `pages-preview-toggle.mjs` | change the preview-deployment setting for a Pages project |
| `deep-research-deploy.mjs` | apply Deep Research migrations, install required encrypted Worker secrets, and deploy its Worker and Custom Domains |
| `deep-research-clear-runs.mjs` | permanently delete all Deep Research jobs and cascaded normalized results while preserving access, provider, token, usage, and audit data |
| `social-desk-provision.mjs` | create the Social Desk D1 database and exact-email Access application; operator addresses come from `--emails` or local `.env` |
| `social-desk-deploy.mjs` | apply Social Desk D1 migrations and deploy its Worker and Custom Domain |
| `social-desk-meta-secrets.mjs` | install the four Social Desk Meta values as encrypted Worker secrets without logging their values |
| `_lib.mjs` | shared edit/read bootstrap, argument, subprocess-environment, Wrangler-path, and audit helpers |

To add a new action: copy an existing file, call `bootEdit()` and `parseArgs()`, keep dry-run
as the default, and add its `node scripts/actions/...` prefix to `.claude/settings.json`'s `ask`
list if it isn't already covered by the existing wildcard. See "Extending" in
`docs/ARCHITECTURE.md` and the full protocol in `docs/SAFETY.md`.
