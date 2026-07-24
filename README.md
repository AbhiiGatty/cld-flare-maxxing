<p align="center">
  <img src="assets/brand/banner.svg" alt="cld-flare-maxxing: the AI agent that runs your Cloudflare account for you" width="100%">
</p>

# cld-flare-maxxing

**The AI agent that runs your Cloudflare account for you.** Point any AI coding harness at
your account once. It snapshots the state, finds what's misconfigured, tells you who changed
what, fixes what you approve, and teaches you how to get more out of the platform. All from
inside your editor, and read-only until you say otherwise. Works with Claude Code today, and
any other harness that reads `AGENTS.md`.

Live site: **[cld-flare-maxxing.abhiigatty.com](https://cld-flare-maxxing.abhiigatty.com)**

## What it does

It snapshots your full account state (DNS, zones, WAF, security settings) into JSON, runs 61
heuristic checks against that snapshot, and turns the results into prioritized findings. It
answers "who changed X" from the Cloudflare audit log, diffs any two snapshots, and puts all
of it in one dashboard along with plan-limit usage and beta-feature scoring.

Each snapshot exists in two copies. The raw one stays on your machine for your own tooling.
The committed one is pseudonymized: real ids, domains, names, emails, and IPs are replaced
with deterministic aliases, so the repo history is safe to make public. Your tokens and the
alias vault that maps aliases back to real values never leave your machine (see
[docs/SHARING.md](docs/SHARING.md)).

Live lookups between snapshots go through Cloudflare's own MCP servers
([.mcp.json](.mcp.json): bindings, builds, observability, docs, DNS analytics, GraphQL,
radar, and the primary Cloudflare server for anything else). On top of that sits this repo's
own safety layer: separate read and edit tokens, and an audited break-glass flow for anything
that changes the account. See [docs/SAFETY.md](docs/SAFETY.md).

Everything lands in this folder, so you build up a versioned history of your account and can
learn from it later.

## Install

### For anyone (no coding required)
1. Install an AI coding harness. [Claude Code](https://claude.com/claude-code) has the fullest
   support here (skills, agents, guardrail hooks); any other harness that reads `AGENTS.md`
   works too, just with less built-in polish.
2. Open this repo as a project in that harness.
3. Say "set me up." It walks you through creating the two Cloudflare API tokens it needs (a
   read-only one for everyday use, an edit one only for the moment you approve a change) and
   creates your local config for you.
4. Say "refresh and show me the dashboard." From here on, just tell it what you want to check
   or change, in plain language.

### For developers
```bash
npm ci                       # install the pinned Wrangler used by guarded deploy actions
npm run dashboard:build      # one-time: install dashboard deps
cp .env.example .env         # PowerShell: Copy-Item .env.example .env
# add CF_READ_TOKEN, see docs/TOKEN-SETUP.md for exact scopes
npm run setup                # verifies the token reaches the API
npm run refresh               # snapshot -> report -> betas -> dashboard data
npm run dashboard             # opens the dashboard at http://localhost:5180
npm run diff                  # see what changed since the last snapshot, and who did it
```

> The repo ships with a generic sample snapshot so the dashboard renders immediately
> (placeholder resources, two illustrative zones, no real account data). Your first
> `npm run refresh` replaces it with your live data.

## Commands
| Command | What it does |
|---|---|
| `npm run setup` | create `.env`, verify the read token |
| `npm run snapshot` | full read-only snapshot to `snapshots/<stamp>/` |
| `npm run report` | findings, limit utilization, and attribution to `reports/` (local-only) |
| `npm run betas` | score beta features against your stack to `reports/betas.json` |
| `npm run diff` | diff the two latest snapshots and who changed what |
| `npm run build-data` | consolidate latest into `dashboard.json` |
| `npm run refresh` | snapshot, report, betas, build-data |
| `npm run dashboard` | run the dashboard (Vite, port 5180) |
| `npm run sanitize` | strip account data from disk, leave only the generic sample (before handing over a zip) |

## Learn and maximize

The same install doubles as a Cloudflare tutor. Ask the `cloudflare-maxxing` skill what the
platform can do or which product fits a need. Ask the `cf-optimizer` agent for a prioritized
list of features your plan includes but you don't use yet. Ask the `cf-architect` agent to
design a solution and sketch the wrangler config. Ask the `cf-investigator` agent what your
current state is, or who changed something.

Answers are grounded in your real snapshot, cite Cloudflare's docs, and stay read-only unless
you explicitly approve a change.

## Safety (read this)

Routine work uses `CF_READ_TOKEN` only and never mutates the account. Any real change needs a
separate `CF_EDIT_TOKEN` (in `.env.break-glass`), which most people never even create. Once
that token exists, destructive actions still require `CF_ALLOW_DESTRUCTIVE=YES_I_AM_SURE`,
run dry-run by default, and get written to `reports/actions-audit.log` (local-only, never
committed). A tripwire hook blocks ad-hoc `curl`/`wrangler` deletes and protects saved state.

Secrets never enter git: `.env*` is gitignored, and token values never enter a snapshot.
Neither does real account data; only the pseudonymized `snapshot.public.json` described above
is committed.

Full details: **[docs/SAFETY.md](docs/SAFETY.md)** · **[docs/TOKEN-SETUP.md](docs/TOKEN-SETUP.md)** ·
**[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** · **[docs/RELEASING.md](docs/RELEASING.md)** ·
**[docs/DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md)** · operating rules in **[CLAUDE.md](CLAUDE.md)**.
Found a security problem? See [SECURITY.md](SECURITY.md). Want to help? [CONTRIBUTING.md](CONTRIBUTING.md).

## For any AI agent working in this repo

Before a key decision (an architecture or safety-model change, a design choice with real
tradeoffs, or anything that might redo prior work), check
**[.claude/experiences/](.claude/experiences/README.md)** first: a log of decisions already
made here, what was tried, why, and whether it got reversed. Write an entry after one too,
including for work later undone. See "Experience log" in [CLAUDE.md](CLAUDE.md) /
[AGENTS.md](AGENTS.md) for the full rule.

## Sharing and GitHub

The committed history contains only pseudonymized snapshots, so the repo can be public
without exposing real account data. [docs/SHARING.md](docs/SHARING.md) lists exactly what
gets aliased and how to reverse an alias back to its real value (`secrets/alias-map.json`
plus `CF_ALIAS_SALT`, both gitignored; back them up privately). `.gitignore` already excludes
`.env*`, the raw local snapshot, real `config/*.json`, and `node_modules/`, and token values
never enter a snapshot at all. Changes go via feature branch, PR, merge.

## License

MIT, see [LICENSE](LICENSE). The framework is free to use and build on. Your tokens, the raw
local `snapshots/*/snapshot.json`, and `secrets/alias-map.json` stay yours; `reports/` and
real `config/*.json` are local-only and never enter git. The committed pseudonymized history
carries no secrets.
