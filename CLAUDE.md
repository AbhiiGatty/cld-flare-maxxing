# CF Command Center — operating contract

This repo is a **versioned, guardrailed control center** for a Cloudflare account.
Any Claude session working here MUST follow these rules. They override default behavior.

The rules below are also mirrored, harness-neutral, in `AGENTS.md` for any AI coding harness
other than Claude Code (Codex, Cursor, Copilot, or a human at a terminal). This file has the
same core plus Claude-specific extras: skills, agents, and interaction style.

## What this is
- Snapshot the **full account + DNS + zone + security state** into `snapshots/` — a local,
  full-fidelity raw copy for your own tooling, plus a pseudonymized `snapshot.public.json`
  sibling that's the one actually committed (`scripts/lib/idmap.mjs`).
- Generate **insight/security reports** (`reports/`) from a 61-check heuristic catalog.
- **Attribute changes** ("who did what") via the Cloudflare audit log.
- Surface **plan-limit utilization** and **beta features** worth testing for this stack.
- Present all of it in a single **dashboard** (`dashboard/`).
- Take **guarded, audited destructive actions** only via break-glass.

## 🟢 Golden rules
1. **Read-only by default.** Routine work uses `CF_READ_TOKEN` only. Snapshots, reports,
   diffs, and the dashboard never mutate the account.
2. **Secrets never get committed.** `.env` and `.env.break-glass` are gitignored. Token
   *values* are never written into snapshots (only metadata). Never paste a token into
   any committed file, report, or chat artifact. The same goes for real account data:
   the raw `snapshots/*/snapshot.json`, `config/backlog.json`, `config/token-capabilities.json`,
   `config/backlog-curated.json`, and the alias vault `secrets/alias-map.json` are all
   gitignored — only the pseudonymized `snapshot.public.json` is committed.
3. **All mutations go through `scripts/actions/*` with break-glass.** Never make changes
   with ad-hoc `curl`/`Invoke-RestMethod`/`wrangler delete`, or with `mcp__cloudflare__execute`
   (Cloudflare's own "Code Mode" MCP server, which runs agent-written code against the live API
   with no fixed tool list, so treat every call through it as a raw API request: reads only). The
   PreToolUse hook (`.claude/hooks/guard.mjs`) blocks the obvious destructive shapes of both.
4. **Confirm before any mutation.** State exactly what will change, on which zone/resource,
   and why. Prefer `--dry-run` (the default) first; only add `--commit` after the human agrees.
5. **Destructive actions require explicit break-glass** (`docs/SAFETY.md`): a separate
   `CF_EDIT_TOKEN` + `CF_ALLOW_DESTRUCTIVE=YES_I_AM_SURE`. Every attempt is written to
   `reports/actions-audit.log` (local-only, see rule 6).
6. **Never delete saved state.** `snapshots/` (both the local raw `snapshot.json` and the
   committed `snapshot.public.json`), `reference/`, `secrets/alias-map.json` (the alias
   vault — losing it makes every already-committed alias unreversible even with the salt),
   and the real `config/*.json` are the point of the repo — the hook blocks recursive
   deletion of all of them. `reports/` is generated output (derived from the local
   snapshot + reference), local-only and gitignored; regenerate it anytime with `npm run report`.
7. **GitHub changes via PR, never direct pushes to `main`** (feature branch → PR → merge).

## Vocabulary: what "deploy it" (and similar) actually means

This repo has two genuinely different things both casually called "deploying": landing code
in git, and actually pushing the live website to Cloudflare. Default to the first one.

- **"Deploy it" / "ship it" / "merge it" / "land it" / "push it"** (no further qualifier) →
  commit the working-tree changes, open a PR, merge it to `main` (golden rule 7). This is what
  it means almost every time, including when the changes happen to live under `site/`.
- **Only** run the actual Cloudflare Pages deploy
  (`CF_ALLOW_DESTRUCTIVE=YES_I_AM_SURE node scripts/actions/pages-deploy-site.mjs --commit`,
  a real break-glass mutation to the live account) when the request is explicit about the live
  site itself: "deploy to Cloudflare," "push it live," "make it live on the site," "the actual
  deploy," or equivalent. If it's genuinely ambiguous which one is meant, ask rather than
  default to the heavier action - merging to `main` is the safer, more reversible guess when
  unsure, so it's the default, not a coin flip.

### Confirming a deploy landed

After someone actually runs `pages-deploy-site.mjs --commit` (the break-glass path above, not
a merge to `main`), `https://cld-flare-maxxing.abhiigatty.com/version.json` reports the commit
that deploy just shipped:

```json
{ "commit": "<full sha>", "shortCommit": "<7 chars>", "builtAt": "<ISO timestamp>" }
```

It's written fresh by `scripts/write-version.mjs`, called from inside
`pages-deploy-site.mjs` right before the `wrangler pages deploy` call - so it's only ever
(re)written at the moment of a real `--commit` deploy, never on a dry-run. `site/_headers` sets
`Cache-Control: no-store` on it so you never read a stale cached copy.

**The check:** capture `git rev-parse HEAD` before running `--commit`, then after the deploy
finishes:
```bash
curl -s https://cld-flare-maxxing.abhiigatty.com/version.json | jq -r .commit
```
If it matches the SHA you captured, that exact commit is live. If it doesn't match yet, the
deploy is still propagating - poll `version.json` again rather than assuming a bare 200 from the
site root means your change shipped.

## Normal workflow
```
npm run setup        # one-time: verify token reaches the API
npm run refresh      # snapshot → report → betas → dashboard data
npm run dashboard    # open the unified dashboard (Vite, port 5180)
npm run diff         # what changed since the previous snapshot + who did it
```

## Investigating
- Start from `reports/latest-report.json` (findings, limits, attribution) and the dashboard.
- For deeper/live questions use the read-only Cloudflare MCP tools (already allowed in
  `.claude/settings.json`) and `cloudflare-docs` search. Prefer them over guessing. For
  zone/DNS/WAF/SSL/rate-limit state the snapshot doesn't cover live, `mcp__cloudflare__execute`
  (GET only) reaches it; see `docs/SAFETY.md` for how it's gated.
- When asked "who changed X", read `snapshot.auditLog` / `reports/*-diff.json` attribution.

## Education & maximization mode
This repo is also a **learning tool** — help the user use Cloudflare to the maximum.
- "What can I do / how do I do X / which product fits / how do I get more out of Cloudflare"
  → invoke the **`cloudflare-maxxing`** skill (use-case map + platform map + beta advisor).
- Deep account analysis ("where am I leaving value on the table") → the **`cf-optimizer`** agent.
- "Design me a solution for X on Cloudflare" → the **`cf-architect`** agent.
- "What's my state / who changed X / what's misconfigured" → the **`cf-investigator`** agent.
- Always ground advice in the real snapshot, cite `cloudflare-docs`, state the free-tier
  position and limits, and give the smallest concrete next step. Teach the "why", not just the "what".
- If the user is about to build something new on Cloudflare (not just govern the existing
  account), Cloudflare's own Skills plugin bundle is a good complementary install: a different
  job than this repo's (this governs an existing account; that bundle helps author Workers/D1/R2/
  Durable Objects code): `claude plugin marketplace add cloudflare/skills` then
  `claude plugin install cloudflare@cloudflare`.

## Sharing this framework
The framework (scripts, skills, agents, dashboard, docs, reference) is **secret-free and meant to
be shared**. Account data (the raw `snapshots/*/snapshot.json`, `reports/`, `config/*.json`) and
tokens/secrets (`.env*`, `secrets/alias-map.json`) are **personal** and gitignored — only the
pseudonymized `snapshot.public.json` is committed. See `docs/SHARING.md`. Before handing over a
zip of the whole working directory (not a fresh git clone), run `npm run sanitize` to strip
account-specific data from disk.

## Token model (two tokens — see docs/TOKEN-SETUP.md)
- `CF_READ_TOKEN` (in `.env`) — read-only, used for everything routine.
- `CF_EDIT_TOKEN` (in `.env.break-glass`, only when armed) — edit/destructive, scoped tight.

## What counts as destructive (always break-glass + confirm)
Deleting/editing DNS records, changing SSL/TLS mode or zone settings, editing WAF/firewall
or rate-limit rules, deleting KV/R2/D1/Workers/Pages, purging cache, creating/revoking
API tokens, changing members/roles, pausing a zone, toggling DNSSEC.

## Clarifying questions

When a request is ambiguous or underspecified, don't guess — ask a clarifying question, and with it propose 2–4 concrete candidate answers you generate yourself (distinct options covering the likely intent) so I can pick or redirect. Before asking, double-check the question and its options **twice**: confirm the question is the real blocker and that each option is accurate, distinct, and plausible. If a sensible default clearly exists, state your assumption and proceed instead of asking.

## Experience log (`.claude/experiences/`)

This folder holds a log of decisions made on this repo: what was tried, why, what actually
happened, and whether it got reversed. It exists so that this repo could be rewritten from
scratch, or a settled question re-opened, without losing the reasoning behind the current
state and without re-discovering the same dead ends at real cost. `docs/CHANGELOG.md` records
*what* shipped; this folder records *why*, including for things later undone.

- **Read it before a key decision.** Architecture or safety-model changes, a design choice
  with real tradeoffs, anything that might reverse or rebuild prior work, or any "should we
  even do this" call: check `.claude/experiences/` first for a relevant prior entry before
  deciding.
- **Ask why, then record it.** When asked to do or undo something significant and the reason
  is not stated, ask (what triggered this, what did it cost, what were the pain points) and
  capture the answer in the entry. The why is the point; git history already has the what.
- **Write an entry after one.** Same bar as above. Use the format and index in
  `.claude/experiences/README.md`. Document reversals and undone work too, not just what
  shipped: the reasoning behind an abandoned approach is exactly what saves the next session
  from repeating it. Add the entry in the same PR as the change where possible.
- Not every change needs an entry. Routine bug fixes and typo corrections don't; see the
  folder's own README for the actual bar.

## Interaction style
Invoke the **`caveman`** skill as the default tone for conversation in this repo — explanations,
summaries, investigation answers, casual back-and-forth. Exception, no caveman: mutation
confirmations, dry-run plans, break-glass warnings, and error messages. That text always stays
plain and unambiguous — safety-critical output is never caveman-ified.

## Environment setup
If `.env` or `.env.break-glass` is missing or incomplete when work starts, don't just point at
`docs/TOKEN-SETUP.md` — walk the user through it conversationally: which template to use ("Read
all resources" for `CF_READ_TOKEN`), which permission table applies for `CF_EDIT_TOKEN` if
they're about to make a change, and where in the Cloudflare dashboard to create it
(`dash.cloudflare.com/profile/api-tokens`). Then run `npm run setup`, which auto-creates `.env`
from `.env.example` and verifies the token reaches the API.

## Writing style
Avoid the tells of AI-generated prose in anything written to this repo — README, docs, commit
messages, PR descriptions (see
[Wikipedia:Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing)):
- No em dash as a comma/period substitute, especially " — " with spaces on both sides.
- No inflated synonyms for plain words — wrote not authored, used not utilized, moved not
  relocated, tried not attempted. A plain "is"/"has" beats "serves as"/"boasts"/"features" for
  a literal fact.
- No negative-parallelism formulas: "it's not just X, it's Y," "not only X but Y," "X rather
  than Y."
- No rule-of-three padding — three short phrases or adjectives in a row to make a point look
  more comprehensive than it is.
- No overused AI vocabulary: delve, crucial, pivotal, robust, seamless, leverage, foster,
  underscore (as a verb), showcase, testament, tapestry/landscape (as abstract nouns),
  intricate, meticulous, align with, boasts, key (as a filler adjective).
- No promotional or peacock phrasing — "rich history," "stands as a testament to," "plays a
  vital role," "in the heart of," "renowned," "diverse array."
- No canned significance statements — sentences whose only job is to assert that something
  matters ("underscores its importance," "marking a pivotal moment") instead of showing why.
- No formulaic wrap-ups ("In summary," "In conclusion," "Overall, X remains...") or
  "despite its challenges, X continues to..." padding.
- No vague, unnamed-authority attributions ("industry reports show," "observers note") — name
  the actual source or drop the claim.
- No bullet list with a bolded inline header on every line ("- **Foo:** does the thing") where
  plain sentences would read better — reserve bold for genuine emphasis, not every list item.
- No title-case section headers by default — sentence case, and only when a header adds real
  navigational value.
- No unsourced superlatives ("one of the most important," "a global leader").
- Prefer concrete, checkable facts and specific numbers over vague grandiosity.
