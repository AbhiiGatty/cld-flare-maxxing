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
| `dpdpa-landing-deploy.mjs` | deploy the validated static-assets-only DPDPA landing to its fixed Worker and Custom Domain |
| `dpdpa-metrics-smoke-cleanup.mjs` | verify and delete one fixed synthetic DPDPA email event from GattyWorks Metrics |
| `gattyworks-metrics-deploy.mjs` | deploy the exact pinned Metrics Worker and dashboard assets, then verify the Jan Aushadhi local origin |
| `jan-aushadhi-metrics-onboard.mjs` | register the two fixed Jan Aushadhi origins in the GattyWorks Metrics D1 through the pinned sibling repository's onboarding script |
| `jan-aushadhi-phone-migration.mjs` | apply the fixed D1 migrations that store manual email and phone price-watch requests and verify they are no longer pending |
| `jan-aushadhi-turnstile-provision.mjs` | create or rotate the fixed Jan Aushadhi Turnstile widget and install its secret on the fixed Worker without logging the secret |
| `jan-aushadhi-deploy.mjs` | build with the fixed production Turnstile site key, deploy the exact pinned Worker and assets, and verify both live domains |
| `metrics-turnstile-dpdpa-hostname.mjs` | add the fixed DPDPA hostname to the existing GattyWorks Metrics Turnstile widget |
| `pages-git-auto-deploy-toggle.mjs` | enable or disable automatic production and preview deploys from a connected Git repository |
| `pages-preview-toggle.mjs` | change the preview-deployment setting for a Pages project |
| `deep-research-deploy.mjs` | apply Deep Research migrations, install required encrypted Worker secrets, and deploy its Worker and Custom Domains |
| `deep-research-clear-runs.mjs` | permanently delete all Deep Research jobs and cascaded normalized results while preserving access, provider, token, usage, and audit data |
| `deep-research-release-usage.mjs` | release 1 to 10 scan credits charged by a confirmed Deep Research job-creation failure |
| `social-desk-provision.mjs` | create the Social Desk D1 database and exact-email Access application; operator addresses come from `--emails` or local `.env` |
| `social-desk-mcp-access.mjs` | create the path-scoped `/mcp*` Access application and Everyone Bypass policy; the Worker still requires a Social Desk bearer token |
| `social-desk-deploy.mjs` | apply Social Desk D1 migrations and deploy its Worker and Custom Domain from the standalone or former nested repo; `--migrations-only` stops before Worker deploy |
| `social-desk-meta-secrets.mjs` | install the four Social Desk Meta values as encrypted Worker secrets without logging their values |
| `_lib.mjs` | shared edit/read bootstrap, argument, subprocess-environment, Wrangler-path, and audit helpers |

To add a new action: copy an existing file, call `bootEdit()` and `parseArgs()`, keep dry-run
as the default, and add its `node scripts/actions/...` prefix to `.claude/settings.json`'s `ask`
list if it isn't already covered by the existing wildcard. See "Extending" in
`docs/ARCHITECTURE.md` and the full protocol in `docs/SAFETY.md`.

The DPDPA landing action has fixed live identifiers. It accepts an absolute source path but
refuses any target other than Worker `gattyworks-dpdpa` and Custom Domain
`dpdpa.gattyworks.com`. It also refuses a Worker entry point, extra bindings, extra routes,
or an asset directory other than `site/`.

The DPDPA Metrics smoke cleanup action accepts no target arguments. Its database, project,
event type, and synthetic email are fixed in the action. A dry run must find exactly one row.
On commit, the action checks the row again with the edit token, deletes that exact event id
and fixed tuple, then verifies that zero matching rows remain.

The GattyWorks Metrics deploy action accepts no target arguments. It fingerprints every Worker
source and dashboard asset used by Wrangler, validates the fixed Worker, Custom Domain, D1
binding, and asset settings, then installs, typechecks, and runs Wrangler's deploy dry run
before break-glass. A commit deploys that exact source and verifies the fixed Jan Aushadhi
local origin against the live preflight endpoint.

The Jan Aushadhi Metrics action accepts no target arguments. It resolves the sibling
`gattyworks-metrics` repository and pins its onboarding script, schema, Wrangler configuration,
package manifest, and lockfile by fingerprint. It registers only `jan-aushadhi-dost` for
`https://india-aushadi.gattyworks.com` and `jan-aushadhi-dost-alias` for
`https://aushadhi.gattyworks.com`. The locked install and typecheck finish before the scoped D1
edit token is loaded, and onboarding subprocess output is withheld so credentials cannot reach
the terminal or audit log.

The Jan Aushadhi Turnstile action accepts no target arguments. It pins the sibling source,
Worker name, widget name, both production hostnames, widget settings, and Wrangler lockfile.
The dry run reads all widgets and refuses hostname overlap. A commit creates the widget when
absent or rotates the exact existing widget secret, then passes that secret to the pinned
Wrangler process on stdin. Logs and audit records contain only the public site key and safe
widget settings.

The Jan Aushadhi phone migration action accepts no target arguments. It pins the sibling
repository, fixed D1 database, complete migration filename list, target SQL hash, Wrangler
configuration, and lockfile. It reads the remote migration state before break-glass, applies
only the already-reviewed pending migration, then verifies that no migration remains pending.

The Metrics Turnstile hostname action accepts only `--commit`. Its dry run reads the live
widget with the read token. The action pins the widget name, public site key, settings, current
hostname list, and final hostname list. It refuses an unexpected live value before sending the
required `PUT`. The commit path adds only `dpdpa.gattyworks.com`, keeps the existing Metrics
hostname and widget settings, then reads the widget again to verify the exact result. Logs and
audit records use a safe projection that excludes the widget secret.
