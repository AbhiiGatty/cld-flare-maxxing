# .claude/experiences/

A log of decisions made on this repo: what was tried, why, what actually happened, and
whether it got reversed. Not a changelog (`docs/CHANGELOG.md` covers what shipped) - this is
the reasoning behind it, kept even when a decision was later undone, so the reasoning itself
isn't lost.

The point: this repo's code and docs describe the current state. They don't say why the
current state beat the alternatives, or what was tried and abandoned. A model rebuilding this
repo from scratch, or re-deciding something already decided, without this folder would
re-litigate settled questions and likely re-discover the same dead ends (sometimes literally
the same bug) at real cost. Read this folder before a key decision; write an entry after one.

See `CLAUDE.md` / `AGENTS.md` ("Experience log") for the read-before/write-after rule.

## What counts as a "key decision"

Worth an entry: architecture or safety-model changes, a design choice with real tradeoffs
(especially ones with a measured cost, like a performance regression), anything reversed or
rebuilt after turning out wrong, any real "should we even do this" call (e.g. whether an
external change makes part of this repo redundant), and a significant agent-run experiment
or analysis (an SEO run, a perf audit, an eval) whose findings should outlive the session.
Not worth an entry: routine bug fixes, typo corrections, or anything with one obvious
correct answer.

## Capturing the why

An entry without a why is just a changelog line. When the reason for a change is not
stated, whoever is making it (human or agent) should ask before recording: what triggered
this, what did it cost, what were the pain points, what would make us revisit it? The
answers go in the entry, in the requester's own words where possible.

## Before any big decision

Read the index below before an architecture change, a dependency add or removal, a feature
removal, a big refactor, or re-running a previously rejected experiment. If a past entry
covers the ground, weigh it before relitigating; if the situation has genuinely changed,
say so in a new entry that links back to the old one.

## Entry format

One file per decision, `YYYY-MM-DD-slug.md`. Loosely:

```md
# Title

**What:** one line - the decision or change
**Why:** the reasoning, including what was tried first if anything
**The why, as given:** the stated reason for doing or undoing this, in the requester's own
  words where possible (trigger, cost, pain points). Ask if it was not stated.
**Outcome:** what actually happened - shipped as-is, partially fixed, still an open
  tradeoff, or reversed (and why, if so)
**Lesson:** optional - only if there's something generalizable beyond this one decision
```

Skip fields that don't apply. Keep it as short as the decision allows; the point is
retrievable reasoning, not a full narrative.

## Index

| Entry | Summary |
|---|---|
| [2026-07-07-cloud-mascot-removed.md](2026-07-07-cloud-mascot-removed.md) | Removed the roaming cloud mascot from the landing page on request; no deeper design lesson, logged for completeness (the pattern for cleanly removing a feature: CSS+JS+HTML all at once, no dead code left behind) |
| [2026-07-07-claude-code-glyph-font-fallback.md](2026-07-07-claude-code-glyph-font-fallback.md) | Hand-built Unicode block-art glyph rendered lopsided; root cause was a font-coverage gap, not a character-choice mistake |
| [2026-07-07-terminal-yn-interactivity.md](2026-07-07-terminal-yn-interactivity.md) | Made the terminal demo's "Apply this? (y/n)" a real interaction instead of static decoration |
| [2026-07-07-reference-terminal-structure.md](2026-07-07-reference-terminal-structure.md) | Borrowed structural patterns from a private reference site's terminal widget, deliberately not its color palette |
| [2026-07-07-dashboard-sandbox-isolation.md](2026-07-07-dashboard-sandbox-isolation.md) | New dashboard component work isolated to its own entry point rather than touching the real dashboard |
| [2026-07-07-cloudflare-primary-mcp-server.md](2026-07-07-cloudflare-primary-mcp-server.md) | Checked whether Cloudflare's own agent-setup release made this repo redundant (no); added the one real gap with a compensating guardrail |
| [2026-07-07-website-animated-background.md](2026-07-07-website-animated-background.md) | Ported a React demo component onto a build-step-free static page; self-hosted its SDK rather than guessing a CDN URL; found and partially fixed a serious performance regression |
| [2026-07-07-ag-logo-banner-placement.md](2026-07-07-ag-logo-banner-placement.md) | Corner placement, not center, verified by geometry rather than eyeballed (superseded in part, see next) |
| [2026-07-07-readme-banner-apple-redesign.md](2026-07-07-readme-banner-apple-redesign.md) | Rebuilt the README banner around a named style direction ("like Apple"); cut dashboard-style UI chrome rather than just restyling it |
| [2026-07-07-doc-style-self-audit.md](2026-07-07-doc-style-self-audit.md) | Self-written docs broke this repo's own writing-style rule; fixed after an explicit re-check |
| [2026-07-08-repo-renamed-to-match-product-name.md](2026-07-08-repo-renamed-to-match-product-name.md) | Renamed the GitHub repo and npm package to close a known naming mismatch; left a same-named Cloudflare Pages project and all historical snapshots deliberately untouched |
| [2026-07-08-deploy-means-merge-not-cloudflare-push.md](2026-07-08-deploy-means-merge-not-cloudflare-push.md) | "Deploy it" defaulted to the wrong one of two things this repo calls "deploying"; now documented directly in CLAUDE.md/AGENTS.md |
| [2026-07-08-snapshot-pseudonymization-and-history-reset.md](2026-07-08-snapshot-pseudonymization-and-history-reset.md) | Committed snapshots now hold deterministic aliases, not real account data, reversible offline via a local vault; entire git history reset to match; two related leaks (dashboard data, a hardcoded account id in CI) found and fixed along the way |
| [2026-07-08-unicorn-scene-data-inlined.md](2026-07-08-unicorn-scene-data-inlined.md) | Animated background's scene data inlined into the page instead of fetched (uncached) from Unicorn Studio's cloud storage on every load; vendoring the SDK script hadn't also vendored the data it loads at runtime |
| [2026-07-08-terminal-mascot-svg-not-unicode.md](2026-07-08-terminal-mascot-svg-not-unicode.md) | Terminal's Claude Code mark rebuilt as an SVG pixel grid instead of Unicode block characters; the prior glyph fix was a mitigation, not removal of the font dependency |
| [2026-07-10-experiences-rollout.md](2026-07-10-experiences-rollout.md) | The experiences convention itself: why this folder exists and the standing rules around it, rolled out across every workspace repo |
| [2026-07-10-pages-preview-urls-left-alone.md](2026-07-10-pages-preview-urls-left-alone.md) | Investigated killing stray Pages preview-deployment URLs; direct-upload projects have no toggle for this (git-integration-only setting), so left as-is |
| [2026-07-23-social-desk-guarded-provisioning.md](2026-07-23-social-desk-guarded-provisioning.md) | Added one idempotent break-glass action for the Social Desk D1 database and exact-email Access app, while leaving Worker deploy and secrets as separate guarded steps |
| [2026-07-24-repository-security-audit.md](2026-07-24-repository-security-audit.md) | Security audit found public identifiers and edit-token process-boundary gaps; both remediation passes closed the code, workflow, dependency, and public-source findings |
| [2026-07-24-public-history-replacement.md](2026-07-24-public-history-replacement.md) | Merged PR diffs keep retired commits reachable after a history reset, so public release now requires deleting and recreating the private GitHub repository from one clean root commit |
