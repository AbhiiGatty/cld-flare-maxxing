# Repository security audit found public-ID leaks and edit-token exposure

**What:** Ran a read-only security audit of the working tree and `origin/main`,
including secret exposure, snapshot pseudonymization, break-glass enforcement,
mutation paths, subprocess handling, dependencies, GitHub Actions, repository
security settings, and the deployed site's response headers.

**Why:** The repository is being prepared for a possible public release. Its main
claim is that routine work uses a read token while mutations require a separate,
tightly scoped edit token. The audit tested whether the implementation still
holds that boundary.

**The why, as given:** The owner wants the repository checked before making it
public, then asked for a security test whose results would remain in the
experience log.

**Outcome:** The core break-glass check passed, no recognizable provider secrets
were found in the tracked tree, and the raw/private file boundaries are still
gitignored. The audit also found three high-risk design gaps and several
medium-risk hardening gaps. No live Cloudflare mutations were made and no fixes
were applied during this audit.

## First remediation pass

Later on 2026-07-24, the first local fix pass closed three findings:

- `idmap.mjs` now rewrites GitHub owner and repository fields with their
  field-specific aliases, including numeric IDs. A second regression found while
  backfilling also fixed case-sensitive dictionary matching in GitHub challenge
  DNS names.
- `capabilities.mjs` now uses GET requests only. Edit capability comes from
  read-only permission-group introspection or remains `unknown`.
- `cf.mjs` now retries GET, HEAD, and OPTIONS only. Mutation requests are issued
  once.

Four Node regression tests were added. All 27 local public snapshots were
regenerated from their preserved raw siblings. A vault-to-public scan then found
zero malformed GitHub source aliases and zero known real GitHub owner,
repository, or ID values. A 174-file provider-secret scan found zero matches,
all script syntax checks passed, the dashboard production build passed, and the
production dependency audit reported zero vulnerabilities. The full development
audit still reports one high and one moderate advisory.

The exact gate is tracked in `docs/PUBLIC-LAUNCH-CHECKLIST.md`. No live
Cloudflare or GitHub setting was changed in this pass.

## Second remediation pass

Later the same day, the remaining code and workflow findings were closed:

- Mutation subprocesses use pinned local Wrangler executables without a shell and receive an
  allowlisted environment. Installs and builds finish before the edit token is loaded.
- Break-glass fails closed when the action audit cannot be written. Dry runs use the read client
  and exit before `bootEdit()`.
- The daily snapshot workflow uses pinned action SHAs and two jobs: the Cloudflare-token job can
  only read repository contents and upload public snapshots, while the PR-writing job has no
  Cloudflare secrets.
- Root and dashboard dependency audits report zero vulnerabilities. The dashboard production
  build passes on Vite 7.3.6.
- The landing-page source declares CSP, HSTS, `Permissions-Policy`, MIME-sniffing, referrer, and
  clickjacking controls.
- Account-specific Social Desk resources became required, validated inputs. Operator addresses
  come only from command-line input or the local env.
- Codex hooks use portable Git-root paths with a Windows override, and public collaboration
  templates were added.

The candidate-tree scan covered 190 files without printing local secret values. It found no
local env value, provider-token pattern, private-key pattern, machine-specific home path, or
merge-conflict marker. A second comparison checked 662 alias-vault real values against all 27
public snapshots and found zero matches. Historical prose and action defaults were also
sanitized; only the deliberate public project, owner, homepage, and contact identities remain.

Fourteen Node tests, all action/script syntax checks, both dependency audits, and the dashboard
production build pass. The local landing page was checked in the in-app browser at 430x932 and
1440x900. The subtitle renders white at weight 500, there is no horizontal overflow, the CTA
dialog works, and the console is clean. The deployed site still has the old subtitle and old
headers because no live Cloudflare deployment was authorized.

## Portable plugin follow-up

The v1.1.0 packaging pass repeated the security gate against the self-contained skill and both
plugin manifests. The root and dashboard dependency audits again reported zero
vulnerabilities. Targeted provider-token, private-key, and credential-assignment scans found
no matches in the candidate tree. Ignored read-token files, edit-token files, raw data,
reports, generated dashboard data, and the alias vault remained outside Git.

Twenty-five Node tests passed. New cases copy the complete skill outside its source path and
verify that initialization creates only `.cloudflare-maxxing/`, preserves an existing host
`.env` and `package.json` byte for byte, rejects unbundled actions, and keeps every bundled
runtime source synchronized with the repository implementation. Synthetic Claude-hook cases
allow ordinary host cleanup and read-only Cloudflare calls while blocking recursive deletion
of `.cloudflare-maxxing/`, direct API deletion, Wrangler deletion, and Cloudflare Code Mode
writes.

The copied-skill dashboard initially exposed a Windows-only launch failure:
`spawnSync npm.cmd EINVAL`. The portable runner now uses the Windows command processor with
fixed npm arguments and its read-only allowlisted environment for dashboard install and
build. Guarded Cloudflare action subprocesses still use no shell. A second copied-skill build
installed 89 locked dashboard packages, reported zero vulnerabilities, and produced the Vite
dashboard successfully.

Both the skill validator and plugin validator passed. Dedicated `gitleaks`, `trufflehog`, and
`detect-secrets` binaries were still unavailable, so the secret scan used targeted patterns
and the existing repository regression suite.

## Scope and method

The audit covered the 157 locally tracked files, 13 untracked non-ignored files,
and the four newer commits on `origin/main`. Tests included:

- targeted private-key and provider-token pattern scans without printing values;
- a comparison between known sensitive values in the local alias vault and all
  27 available `snapshot.public.json` files;
- synthetic break-glass, hook, API retry, and pseudonymization unit cases;
- manual review of every guarded action and the newer Social Desk actions;
- `npm audit` for all and production-only dependencies;
- Node syntax checks, TypeScript checking, and a production dashboard build;
- workflow permission and action-reference checks;
- live response-header inspection of the deployed site;
- GitHub security-setting and scheduled-workflow status checks.

Dedicated `gitleaks`, `trufflehog`, `semgrep`, and `actionlint` binaries were not
installed, so the secret and static-analysis passes used targeted local checks.
Ignored `.env`, raw snapshot, and vault values were never printed.

## Findings

| Severity | Finding | Evidence and impact |
|---|---|---|
| High | Numeric GitHub identities are not pseudonymized | `scripts/lib/idmap.mjs` mints aliases for `owner_id` and `repo_id` after converting them to strings, but the rewrite pass returns numeric leaves unchanged. A synthetic test reproduced this. Twenty-five committed public snapshots contain 208 raw owner/repository ID occurrences; the newest untracked public snapshot adds 10. One older committed snapshot also retains a known real repository name inside an audit-log resource string. These values can correlate a supposedly pseudonymous Cloudflare snapshot with GitHub identities. |
| High | Deployment subprocesses inherit the edit token | `scripts/actions/pages-deploy-site.mjs` runs unpinned `npx --yes wrangler` with `CLOUDFLARE_API_TOKEN`, the full inherited environment, and `shell: true` on Windows. Its project and branch arguments are not validated. Node warns not to pass unsanitized input when a shell is enabled. The newer Social Desk deploy and secret actions call `bootEdit()` before `npm ci` or build steps, so dependency lifecycle scripts and project build scripts can read `CF_EDIT_TOKEN`. A compromised package or source tree could exfiltrate the account edit token after the operator arms break-glass. |
| High | Capability detection sends unguarded write verbs | `scripts/capabilities.mjs` sends 16 real `PATCH`, `PUT`, or `DELETE` requests with the edit token against sentinel resource IDs. It does not call `bootEdit()`, require the arming phrase, or write the action audit. The code assumes every endpoint will reject a nonexistent ID without an upsert or other side effect. That assumption is outside the action guard and could change with an API endpoint. This audit did not run the capability probe. |
| Medium | Mutating API calls are retried automatically | `scripts/lib/cf.mjs` retries every method after network errors, HTTP 429, or 5xx responses. A synthetic `POST` received a 500 and was issued twice. Non-idempotent DNS, Access, D1, and Pages creates can therefore be repeated when the first request succeeded server-side but its response failed. |
| Medium | Audit logging fails open | `scripts/lib/guard.mjs` catches audit-log write failures, warns, and continues. An armed mutation can therefore proceed without the audit record that the safety documentation promises. The log is also local and gitignored, so it is not tamper-evident. |
| Medium | Three dry runs arm the edit path before checking `--commit` | `dns-delete-record.mjs`, `purge-cache.mjs`, and the untracked `pages-preview-toggle.mjs` call `bootEdit()` before the dry-run branch. They require and expose the edit token for read-only planning, contrary to the read-token-first design. |
| Medium | GitHub workflow supply-chain controls are incomplete | The daily workflow grants `contents: write`, pushes directly to `main`, and references `actions/checkout@v5` and `actions/setup-node@v5` by movable tags. GitHub recommends full commit SHA pinning for immutable action code. The workflow currently fails because `CF_ALIAS_SALT` is absent; only `CF_ACCOUNT_ID` and `CF_READ_TOKEN` are configured. |
| Medium | Repository security reporting is not enabled | Private vulnerability reporting and Dependabot vulnerability alerts returned 404, and repository rulesets returned 403 for the current private-plan configuration. This leaves no working confidential report path matching `SECURITY.md` and no automated dependency alerting. |
| Medium | Development dependencies contain known advisories | The full dashboard audit reports one high-severity direct Vite advisory and one moderate transitive esbuild advisory. The production-only audit reports zero vulnerabilities. This still matters because the Vite server handles local dashboard data that contains real account details. |
| Medium | The public site has a thin security-header policy | The live response has `X-Content-Type-Options` and `Referrer-Policy`, but no Content Security Policy, HSTS, `Permissions-Policy`, or `frame-ancestors`/equivalent clickjacking control. The current `innerHTML` calls receive fixed local strings; visitor input is written with `textContent`, so the reviewed terminal interaction did not expose a direct DOM-XSS path. |
| Low | Guard and pseudonymization regressions have no automated tests | There is no root or dashboard test script. The numeric-ID leak, mutating retry behavior, fail-open audit, and edit-token subprocess inheritance are all suitable regression tests. |
| Low | Public-launch privacy details remain in current source | `origin/main` contains three exact operator emails in the Social Desk provisioning action and one non-example email in the site. No email values are repeated here. Publishing them would increase targeted phishing and identity-correlation risk. |

## Controls that passed

- Recognizable private-key, AWS, GitHub, Slack, Stripe, OpenAI, and literal
  bearer-token patterns had zero matches in both the working tree and
  `origin/main`.
- `.env`, `.env.break-glass`, the alias vault, raw snapshots, real config,
  reports, and generated dashboard data remain ignored and untracked.
- Public snapshots had zero non-example email values, zero non-reserved IP
  values, zero credential-bearing fields, and zero raw token/salt markers.
  This pass does not cancel the separate numeric GitHub ID finding.
- Synthetic break-glass cases refused a missing edit token and a missing arming
  phrase, then allowed the case where both were present.
- The tracked guard hook allowed a benign read, blocked an ad-hoc Cloudflare
  `DELETE`, allowed an armed action-script command, and blocked recursive
  deletion of protected state. It still allows ad-hoc `PATCH` by the deliberate
  policy recorded in
  `2026-07-07-cloudflare-primary-mcp-server.md`.
- All 27 local `.mjs` files and the three newer remote action scripts passed
  Node syntax checks. TypeScript checking and the dashboard production build
  passed.

## Recommended fix order

1. Fix numeric-leaf rewriting in `idmap.mjs`, add a vault-to-public-snapshot
   regression test, regenerate every public snapshot, and repeat the repository
   history/publication decision from
   `2026-07-08-snapshot-pseudonymization-and-history-reset.md`.
2. Pin Wrangler in a lockfile and invoke its local executable without a shell.
   Validate action arguments. Run installs and builds before loading the edit
   token, and give mutation subprocesses a minimal environment.
3. Replace live write-verb capability probes with permission introspection. If
   a probe remains necessary, move it into an explicitly armed and audited
   action with endpoint-specific proof that the operation cannot upsert.
4. Retry only safe/idempotent requests unless an action supplies an idempotency
   mechanism. Make audit persistence fail closed before a mutation.
5. Move all dry-run reads to the read client and call `bootEdit()` only after
   `--commit` is confirmed.
6. Pin GitHub Actions to full SHAs, use a PR-based snapshot workflow, restore the
   alias-salt secret, and enable security reporting and dependency alerts.
7. Upgrade Vite/esbuild, add the missing security headers, and add automated
   tests for every safety boundary above.

## References

- [Cloudflare Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)
- [Node child-process security warning](https://nodejs.org/api/child_process.html)
- [GitHub Actions secure-use reference](https://docs.github.com/en/actions/reference/security/secure-use)

**Lesson:** A passing secret-pattern scan is not enough for this repository.
The vault-to-public comparison found identity leaks that did not look like
credentials, and the edit token was protected at the API client while still
being exposed to general subprocess code. The two-token model must be enforced
at process boundaries as well as at REST-call boundaries.
