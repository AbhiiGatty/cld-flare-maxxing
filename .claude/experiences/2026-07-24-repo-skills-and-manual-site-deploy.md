# Keep agent use independent from the website

**What:** Kept the repository as the Claude Code and Codex control center, treated the static
website as a maintainer-only introduction, and chose guarded local Pages uploads instead of
Git-triggered website builds.

**Why:** The repository is mainly used by opening it in an agent or loading its repo-scoped
skill. The website must not add install steps, runtime work, or deployment side effects to that
path. The recreated GitHub repository also left the existing Pages project linked to a stale
repository identity, so automatic builds were no longer a reliable deployment path.

**The why, as given:** The owner said the project will mainly be used as a plugin or skill in
Claude or Codex, and the website should not bother or slow down people who use the repository.
They asked to deploy the site once from the local machine instead of linking it to the
repository.

**Outcome:** The read-only start now needs no package install, the edit token is introduced
only when a real change is needed, and the README has direct Claude Code and Codex instructions.
The duplicated Claude instructions were replaced with a small layer over `AGENTS.md`. Optional
Cloudflare MCP configuration was reduced to the current primary and documentation servers.
Tests now verify that normal setup, refresh, report, dashboard, and skill-loading paths do not
build or deploy `site/`. The Pages upload preflight was fixed to fail closed, and a separate
guarded action can turn off Git-triggered production and preview deployments before a manual
upload.

The "repository as control center" part was superseded later the same day by
[2026-07-24-portable-plugin-first-architecture.md](2026-07-24-portable-plugin-first-architecture.md).
The website isolation and guarded local deployment decision still stands.

**Lesson:** A project website can explain an agent-first repository without becoming part of
the product's install or execution path. Keep its build and deployment entry points explicit,
maintainer-only, and absent from routine scripts.
