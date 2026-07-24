---
name: cloudflare-maxxing
description: Inspect, explain, secure, and maximize a Cloudflare account from any host project through a portable read-first toolkit. Use for Cloudflare setup, account snapshots, misconfiguration or security reviews, change attribution, DNS/WAF/Pages questions, product and free-tier recommendations, or a user-approved Cloudflare change.
---

# Cloudflare Maxxing

Run the bundled toolkit from any project without using that project's `.env`, dependencies, or
source tree. Keep all credentials and generated account state under:

```text
<host-project>/.cloudflare-maxxing/
```

Resolve the runner at `scripts/cf-maxxing.mjs` relative to this `SKILL.md`. In Claude Code, the
same file is available at:

```text
${CLAUDE_PLUGIN_ROOT}/skills/cloudflare-maxxing/scripts/cf-maxxing.mjs
```

Run commands with `node "<absolute-runner-path>" <command>`. The current working directory is
the host project. Add `--project=<absolute-path>` only when the user names a different project.

## First use

1. Run `init`.
2. Tell the user to create Cloudflare's **Read all resources** API token at
   `https://dash.cloudflare.com/profile/api-tokens`.
3. Tell them to put it in `.cloudflare-maxxing/.env.cloudflare` as `CF_READ_TOKEN`.
4. Never ask them to paste a token into chat.
5. Run `setup`, then `refresh`.
6. Read `.cloudflare-maxxing/reports/latest-report.json` and summarize the findings.

Do not install root dependencies for setup, snapshots, reports, diffs, or recommendations.
Run `dashboard` only when the user asks to view it; that command installs the dashboard's
locked dependencies inside `.cloudflare-maxxing/dashboard/`.

## Routine commands

```text
init
setup
refresh
snapshot
report
diff
betas
capabilities
resolve <alias>
dashboard
dashboard:build
where
```

Use `refresh` for "check my account", "what is misconfigured", "what changed", and similar
requests when the local snapshot is missing or stale. Prefer existing reports when they are
fresh enough for the question.

## Recommendations

Ground advice in the current snapshot and report. Read
[references/use-cases.md](references/use-cases.md) to map a need to Cloudflare products and
[references/platform-map.md](references/platform-map.md) when comparing the wider platform.
State the free-tier position, the relevant limit, and the smallest useful first step.

Verify current syntax, limits, and availability against Cloudflare's documentation before
asserting them.

## Changes

Read [references/safety.md](references/safety.md) before any account mutation.

Only these guarded actions ship in the portable skill:

```text
dns-create-record
dns-delete-record
pages-preview-toggle
purge-cache
security-baseline
waf-managed-deploy
```

Run an action without `--commit` first:

```text
action <name> [arguments]
```

State exactly what will change and wait for explicit approval. Only then use the separate
break-glass env and rerun with `--commit`. Never use an ad-hoc API or Wrangler write.

## Host-project boundaries

- Do not read or modify the host project's generic `.env`.
- Do not add Cloudflare packages to the host project's package manifest.
- Do not deploy the host project unless the user separately asks.
- Do not commit `.cloudflare-maxxing/`; its nested `.gitignore` keeps it local by default.
- Do not write into the installed plugin or skill directory. Treat it as read-only.
