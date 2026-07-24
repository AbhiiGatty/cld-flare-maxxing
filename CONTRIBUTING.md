# Contributing

Thanks for looking at this. The short version: the framework is shared, the data is not.

## Ground rules

- Read `AGENTS.md` first (or `CLAUDE.md` if you're using Claude Code). It's the operating
  contract for any agent or human working in this repo, and it explains the safety model:
  read-only by default, dry-run first, break-glass for anything destructive.
- Changes go through a feature branch and a PR to `main`. No direct pushes.
- Never commit account data or secrets. `.gitignore` already fences off `.env*`, the raw
  `snapshots/*/snapshot.json`, `reports/`, real `config/*.json`, and `secrets/`. If your
  change makes a new file that contains real account values, gitignore it and add a
  `.example` template instead.
- Writing style for docs and commit messages: see the "Writing style" section of `CLAUDE.md`.

## Getting a working setup

```bash
npm ci                    # install the root's locked tooling
npm run dashboard:build   # one-time: install dashboard deps
cp .env.example .env      # add your own read-only token (docs/TOKEN-SETUP.md)
npm run setup
npm run refresh
npm run dashboard
```

The repo ships with a generic sample snapshot, so the dashboard renders before you connect
a real account.

## Good places to start

- `reference/heuristics-catalog.json` — add or refine security/performance checks. Each
  check needs an id, severity, and a concrete recommendation. `scripts/report.mjs` computes
  the ones it can.
- `reference/limits.json` and `reference/betas.json` — keep plan limits and beta features
  current with Cloudflare's docs.
- Collectors in `scripts/snapshot.mjs` — coverage for products the snapshot doesn't reach yet.
- Dashboard polish (`dashboard/`).

Open an issue before large changes so the direction is agreed first.

By participating, you agree to follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Security
problems follow the private process in [SECURITY.md](SECURITY.md), not the public issue tracker.
