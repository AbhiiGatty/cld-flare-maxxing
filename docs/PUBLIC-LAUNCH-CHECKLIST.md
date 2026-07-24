# Public launch checklist

Last checked: 2026-07-24.

Keep the repository private until every item under "Release blockers" is complete. The
checkboxes record verified state, not intent.

## Verified locally

- [x] MIT license is present and GitHub recognizes it.
- [x] `README.md`, `CONTRIBUTING.md`, and `SECURITY.md` are present.
- [x] GitHub About has a description and the live-site homepage URL.
- [x] Raw snapshots, tokens, the alias vault, reports, and real config files are ignored and
  untracked.
- [x] Numeric GitHub owner and repository IDs are pseudonymized.
- [x] Case variants of known GitHub names are pseudonymized in structured strings.
- [x] All 27 local public snapshots were regenerated and checked against the local alias
  vault. The targeted scan found zero known real GitHub owners, repositories, or IDs.
- [x] Capability discovery uses GET requests only. If permission-group introspection is not
  available, edit capability is reported as unknown.
- [x] The API client retries GET, HEAD, and OPTIONS requests only. Mutation requests fail on
  the first network, rate-limit, or server error.
- [x] Fourteen regression tests cover pseudonymization, capability probes, request retries,
  subprocess isolation, dry-run token loading, audit persistence, workflow permissions, site
  headers, and portable Codex hooks.
- [x] The landing-page subtitle is pure white with a heavier weight in local source.
- [x] The dashboard production build and Node syntax checks pass.
- [x] Root and dashboard dependency audits report zero known vulnerabilities.
- [x] The subtitle fix renders as true white at weight 500 at 430x932 and 1440x900 with no
  horizontal overflow. The CTA dialog opens and closes, and the browser console is clean.
- [x] The 191-file candidate public tree contains no local env value, provider-token pattern,
  private-key pattern, machine-specific home path, or merge-conflict marker.
- [x] None of 662 real alias-vault values appears in any of the 27 public snapshots.
- [x] Account-specific action defaults and old operational prose were removed or replaced with
  required caller-supplied values. The remaining real names are the deliberate public project,
  owner, homepage, and security-contact identities.

## Release blockers

- [x] Remove edit-token access from install, build, and general shell subprocesses. Use a
  pinned local Wrangler executable, no shell interpolation, validated arguments, and a
  minimal child environment.
- [x] Apply the same subprocess boundary to the Social Desk action scripts currently present
  on `origin/main`.
- [x] Make action-audit persistence fail closed before a mutation can start.
- [x] Move every dry-run read to the read client and load the edit token only after
  `--commit` has been selected.
- [x] Upgrade the dashboard toolchain. Both dependency audits now report zero vulnerabilities.
- [x] Add a Content Security Policy, HSTS, `Permissions-Policy`, and clickjacking protection
  to the public site.
- [x] Change the daily snapshot workflow to open a PR instead of pushing directly to `main`,
  reduce its permissions, pin third-party actions to commit SHAs, and restore the
  `CF_ALIAS_SALT` secret.
- [x] Provide a working private security-reporting path. `SECURITY.md` now has a public contact
  fallback. GitHub private vulnerability reporting is unavailable while the repository is
  private and will be enabled when visibility changes.
- [x] Replace the GitHub repository with a private, single-root-commit copy. This was required
  because merged pull-request diffs keep old commits reachable after a force-push.
- [x] Sync the four newer `origin/main` commits and reconcile the public-launch changes on the
  `codex/public-launch-hardening` branch.
- [x] Repeat the secret scan, vault comparison, dependency audits, tests, and build on the
  one-commit release candidate. The live header check remains under "Site launch" because the
  source has not been deployed.

## Repository presentation

- [x] Add GitHub topics:
  `cloudflare`, `cloudflare-workers`, `security-audit`, `dns`, `devtools`,
  `infrastructure-as-code`, `ai-agent`, `claude-code`, `cloudflare-pages`, and `codex`.
- [x] Add an issue bug-report form and feature-request form.
- [x] Add a pull-request template with test, security, snapshot, and documentation checks.
- [x] Add a code of conduct before inviting outside contributions.
- [x] Enable GitHub Discussions for setup help and examples.
- [ ] Add dashboard and terminal screenshots or a short demo GIF to the README.
- [ ] Verify the README quick start on macOS and Linux. The one-commit candidate passed a clean
  Windows clone, `npm ci`, tests, audit, and dashboard build.
- [x] Check the install, test, audit, and dashboard-build commands against a clean Windows clone.
  Account setup was not run because it would use the local Cloudflare token.
- [x] Review public source for personal email addresses. Only examples, pseudonymous addresses,
  and the deliberate public security/contact address remain.

## First release

- [x] Pick `v1.0.0` as the public version; both package manifests already match.
- [x] Add the release entry to `docs/CHANGELOG.md`.
- [x] Create and push the annotated `v1.0.0` tag.
- [x] Publish the first GitHub Release as a non-draft, non-prerelease latest release.
- [x] Confirm the release tag resolves to the clean root and its 256-entry archive tree contains
  no ignored private paths.
- [x] Confirm the repository community profile after adding templates. GitHub reports 100%.

## Site launch

- [x] The live root returned HTTP 200 on five checks. After the first DNS lookup, measured
  time to first byte was 88 to 137 ms from this workstation. This is an availability check,
  not a Core Web Vitals audit.
- [x] Review the white subtitle change at mobile and desktop widths.
- [ ] Run a mobile performance and accessibility audit against the release candidate.
- [ ] Deploy the landing page to Cloudflare only after explicit approval.
- [ ] Restore the deploy marker. The live `/version.json` currently returns the landing-page
  HTML instead of JSON.
- [ ] Confirm `/version.json` matches the release commit after the live deploy.
- [ ] Recheck the root page, documentation links, social links, custom domain, TLS, response
  headers, and cache behavior from an unauthenticated browser.
- [ ] Record final Core Web Vitals and the deployed commit in the release notes.

## Visibility change

- [x] Create a full private Git bundle outside the repository before deleting the GitHub copy.
  Ignored local files, including both env files and the alias vault, remain on this machine and
  are never included in the replacement commit.
- [x] Review the candidate tree and one-commit history for account data, local env values,
  provider-token signatures, machine paths, and non-allowlisted alias-vault values.
- [ ] Switch the repository to public only after all release blockers are checked.
- [ ] After the visibility change, enable private vulnerability reporting and retry
  repository auto-merge. GitHub currently returns `404` for private vulnerability reporting
  and leaves auto-merge disabled while this repository is private. Dependabot alerts and
  automated security fixes are already enabled.
- [ ] Verify the anonymous GitHub view, clone the public repository into a clean directory,
  and run its documented setup path.
- [ ] Announce only after the public clone and live site both pass.
