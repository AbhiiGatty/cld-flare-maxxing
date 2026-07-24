# Architecture

## Portable package

The canonical distributable is:

```text
plugins/cld-flare-maxxing/
├── .codex-plugin/plugin.json
├── .claude-plugin/plugin.json
├── skills/cloudflare-maxxing/
│   ├── SKILL.md
│   ├── references/
│   └── scripts/
│       ├── cf-maxxing.mjs
│       └── runtime/
├── agents/
└── hooks/
```

The skill directory is self-contained. Copying that whole directory into a project's
`.claude/skills/` or `.agents/skills/` folder retains the runner, reference catalog,
dashboard, snapshot code, report code, and guarded actions.

The plugin adds manifests, specialist agents, marketplace updates, and Claude's command
tripwire. It does not need an MCP server or a repository checkout.

## Host-project boundary

The runner resolves the current working directory as the host project and creates one
namespaced state directory:

```text
<host-project>/.cloudflare-maxxing/
```

`CF_MAXXING_HOME` points the bundled runtime at that state. `CF_MAXXING_BUNDLE_ROOT` points it
at the read-only code, dashboard template, and reference catalog inside the installed skill.
Neither variable needs to be set by a user.

The runtime reads:

```text
.cloudflare-maxxing/.env.cloudflare
.cloudflare-maxxing/.env.cloudflare.break-glass
```

It never falls back to the host project's `.env`. Dashboard dependencies are installed only
under `.cloudflare-maxxing/dashboard/` and only when the dashboard is requested.

## Data flow

```text
Cloudflare API (read token)
        |
        v
snapshot.mjs
        |
        +--> snapshots/<stamp>/snapshot.json         local raw state
        +--> snapshots/<stamp>/snapshot.public.json pseudonymized state
        |
        +--> report.mjs --> reports/latest-report.json
        +--> betas.mjs  --> reports/betas.json
        +--> diff.mjs   --> reports/latest-diff.json
        |
        v
build-dashboard-data.mjs --> dashboard/public/data/dashboard.json
        |
        v
React and Vite dashboard
```

Reports and dashboard data use the raw local snapshot. Only the public sibling produced by
`scripts/lib/idmap.mjs` is suitable for publication.

## Runtime map

| Path | Purpose |
|---|---|
| `scripts/lib/cf.mjs` | Cloudflare REST and GraphQL clients, pagination, and safe retries |
| `scripts/lib/guard.mjs` | Break-glass checks and action audit logging |
| `scripts/lib/paths.mjs` | Repository and portable state-path resolution |
| `scripts/lib/idmap.mjs` | Deterministic aliases and local reverse-lookup vault |
| `scripts/snapshot.mjs` | Resilient account and zone collectors |
| `scripts/report.mjs` | Heuristic checks, limits, and attribution |
| `scripts/diff.mjs` | Snapshot differences and audit-log correlation |
| `scripts/betas.mjs` | Product and beta recommendations |
| `scripts/actions/*` | Guarded mutations, dry-run by default |
| `reference/*` | Heuristics, limits, products, and API routes |
| `dashboard/` | Local React and Vite interface |

The repository root keeps the same runtime as a contributor and release test harness.
`scripts/lib/paths.mjs` uses the root layout when the two portable path variables are absent.

## Extending

- Add a check to `reference/heuristics-catalog.json` and its computation to
  `scripts/report.mjs`.
- Add a mutation only through `scripts/actions/`, then explicitly add its name to the
  portable runner allowlist if it belongs in the public package.
- Add a dashboard panel in `dashboard/src/App.jsx`.
- Update both the root source and bundled runtime, then run the portable drift test.
