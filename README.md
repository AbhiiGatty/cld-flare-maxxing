<p align="center">
  <img src="assets/brand/banner.svg" alt="cld-flare-maxxing: the AI agent that runs your Cloudflare account for you" width="100%">
</p>

# cld-flare-maxxing

**The AI agent that runs your Cloudflare account for you.** Point any AI coding harness at
your account once. It snapshots the state, finds what's misconfigured, tells you who changed
what, fixes what you approve, and teaches you how to get more out of the platform. All from
inside your editor, and read-only until you say otherwise. It works with Claude Code, Codex,
and any other harness that reads `AGENTS.md`.

Live site: **[cld-flare-maxxing.abhiigatty.com](https://cld-flare-maxxing.abhiigatty.com)**

The repository is the product. The website is a static introduction for people deciding
whether to use it. Nothing in setup, refresh, reporting, testing, or the dashboard builds or
deploys the website.

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

Optional live lookups use Cloudflare's API and documentation MCP servers in
[.mcp.json](.mcp.json). They authenticate with Cloudflare only when first used. The normal
snapshot and report workflow uses the local read token instead. Any approved change goes
through the repo's separate edit token and audited break-glass flow. See
[docs/SAFETY.md](docs/SAFETY.md).

Everything lands in this folder, so you build up a versioned history of your account and can
learn from it later.

## Start here

Clone the repository and open that folder in your agent. Its project skills load
automatically from `.claude/skills/` in Claude Code and `.agents/skills/` in Codex. This is a
repo-scoped skill kit, so no marketplace plugin install is required.

You need Git and Node.js 20.19+ or 22.12+. You do not need to run `npm install` for read-only
setup, snapshots, reports, or diffs.

### Claude Code

```bash
git clone https://github.com/AbhiiGatty/cld-flare-maxxing.git
cd cld-flare-maxxing
claude
```

Then say:

> Set up read-only Cloudflare access. Do not create an edit token. Then refresh and show me
> the dashboard.

Claude Code discovers the project skill and guardrail hook from `.claude/`. See
[Claude Code skills](https://code.claude.com/docs/en/skills).

### Codex

Open the cloned folder in the Codex app, or run:

```bash
cd cld-flare-maxxing
codex
```

Use the same prompt:

> Set up read-only Cloudflare access. Do not create an edit token. Then refresh and show me
> the dashboard.

Codex discovers the project skill from `.agents/skills/` and the operating rules from
`AGENTS.md`. No global skill copy is needed. The short cross-agent guide is
[docs/USING-WITH-CLAUDE-AND-CODEX.md](docs/USING-WITH-CLAUDE-AND-CODEX.md).

### Terminal setup

If you prefer to run the steps yourself:

```bash
cp .env.example .env         # PowerShell: Copy-Item .env.example .env
# Add CF_READ_TOKEN. See docs/TOKEN-SETUP.md for the exact read-only template.
npm run setup                # verify the read token
npm run refresh              # snapshot -> report -> betas -> dashboard data
npm run dashboard            # install dashboard packages and open http://localhost:5180
npm run diff                 # compare the two latest snapshots
```

> The repo ships with a generic sample snapshot so the dashboard renders immediately
> (placeholder resources, two illustrative zones, no real account data). Your first
> `npm run refresh` replaces it with your live data.
>
> `CF_EDIT_TOKEN` is optional. Do not create it unless you have a specific change to make.
> Root `npm ci` is only needed for guarded Wrangler deployment actions.

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
| `npm test` | run the safety regression tests |
| `npm run sanitize` | strip account data from disk, leave only the generic sample (before handing over a zip) |

## Learn and maximize

The same install doubles as a Cloudflare tutor. Ask the `cloudflare-maxxing` skill what the
platform can do or which product fits a need. Ask the `cf-optimizer` agent for a prioritized
list of features your plan includes but you don't use yet. Ask the `cf-architect` agent to
design a solution and sketch the wrangler config. Ask the `cf-investigator` agent what your
current state is, or who changed something.

Answers are grounded in your real snapshot, cite Cloudflare's docs, and stay read-only unless
you explicitly approve a change.

Copying only the `cloudflare-maxxing` skill into another project gives the agent its teaching
and architecture guidance. Snapshotting, reports, the dashboard, and guarded actions still
need this repository because their scripts and local state live here.

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
