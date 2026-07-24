# Changelog

This file records framework releases. Local Cloudflare account activity belongs in the
gitignored `reports/actions-audit.log`, not in the public changelog.

## v1.1.0 - 2026-07-24 - Portable plugin release

### Added

- Added installable Claude Code and Codex plugin manifests and repository marketplaces.
- Added a self-contained `cloudflare-maxxing` skill with its scripts, reference catalog,
  dashboard source, and allowlisted guarded actions.
- Added a portable runner that works from any host project.

### Changed

- Made plugin installation the normal user path. Cloning the repository is now a contributor
  workflow.
- Namespaced portable credentials and generated state under the host project's
  `.cloudflare-maxxing/` directory.
- Kept the host project's `.env`, dependencies, source, and deployment commands outside the
  portable runtime.
- Reduced optional Cloudflare MCP configuration to the API and documentation servers using
  current Streamable HTTP endpoints.
- Made the static website and its maintainer-only deployment path separate from user setup.

### Fixed

- Pages deployment preflight now reads the existing project list without unsupported
  pagination and fails instead of reporting an API error as an empty account.
- Claude Code imports the shared operating contract once and no longer requests an unavailable
  conversation-style skill.

## v1.0.0 - 2026-07-24 - First public release candidate

### Added

- Read-only snapshots with a committed pseudonymized sibling and a local alias vault.
- A 61-check findings report, change attribution, account diffs, plan-limit tracking, and beta
  feature recommendations.
- A local dashboard and a public landing page.
- Guarded action scripts that default to dry-run and require a separate edit token plus an
  explicit break-glass phrase for mutations.
- Claude Code and Codex hooks, Cloudflare-focused agent profiles, and a portable `AGENTS.md`
  operating contract.
- Node regression tests for pseudonymization, API retry rules, action subprocess isolation,
  fail-closed audit logging, GitHub workflow permissions, site headers, and Codex hook paths.
- Contributor, security, conduct, issue, and pull-request templates for public collaboration.

### Security

- Pseudonymized numeric GitHub identifiers and case variants inside structured strings.
- Replaced write-shaped capability probes with read-only permission introspection.
- Limited retries to GET, HEAD, and OPTIONS requests.
- Prevented edit-token inheritance by install, build, and general shell subprocesses.
- Required the action audit record to persist before break-glass can arm.
- Moved dry-run discovery to the read client and delayed edit-token loading until `--commit`.
- Pinned Wrangler and GitHub Actions dependencies.
- Added CSP, HSTS, `Permissions-Policy`, MIME-sniffing, referrer, and clickjacking headers.
- Removed account-specific resource names and operator addresses from public action source.

### Changed

- The daily snapshot workflow now uploads a public-only artifact and opens a pull request from
  a second job that has no Cloudflare credentials.
- Dashboard tooling now uses Vite 7.3.6 and reports zero known dependency vulnerabilities.
- The landing-page supporting copy uses true white at weight 500 for better readability.
- Public repository history is rebuilt from this release tree so old pull-request diffs cannot
  keep retired account data reachable.
