# Sharing this framework (and keeping secrets secret)

`cld-flare-maxxing` is built in three layers:

### 🟢 Shareable framework (secret-free)
Safe to share / fork / open-source:
- `scripts/` — snapshot, report, diff, betas, dashboard-data, guarded actions, sanitize,
  `scripts/lib/idmap.mjs` (the pseudonymization engine itself)
- `.claude/` — skill (`cloudflare-maxxing`), agents (`cf-investigator`, `cf-optimizer`,
  `cf-architect`), permission tiers, tripwire hook
- `dashboard/` — the React/Vite UI
- `reference/` — curated betas / limits / heuristics / API map (generic knowledge)
- `docs/`, `README.md`, `CLAUDE.md`, `.env.example`, `.env.break-glass.example`

This layer contains **no credentials and no account data**. Anyone can drop in their own
read token and run it against their own Cloudflare account.

### 🟡 Committed, but pseudonymized
- **`snapshots/<stamp>/snapshot.public.json`** — the versioned account-state record this
  repo exists to keep, with every real id, domain, resource name, email, and origin IP
  replaced by a deterministic alias (`zone_46147b4b`, `zone-8ea7a05e.example.com`,
  `user-11c04969@example.com`, ...). Same real value always produces the same alias, so
  history and `npm run diff` stay meaningful across the whole committed record. Free-text
  fields with unbounded PII risk (DNS record comments, Pages deploy commit messages, WAF
  rule descriptions/expressions) are fully redacted rather than partially scrubbed.

### 🔒 Personal (never leaves your machine, never committed)
- **Tokens** — `.env`, `.env.break-glass`. Token *values* are never written into snapshots
  either (only metadata).
- **The raw snapshot** — `snapshots/<stamp>/snapshot.json`, the full-fidelity local copy
  with real data. Everything else local (`report.mjs`, `diff.mjs`, `betas.mjs`,
  `build-dashboard-data.mjs`, the dashboard you run with `npm run dashboard`) reads from
  this, so your day-to-day workflow shows real names — only what gets committed is aliased.
- **`reports/`** — findings, betas, the actions audit log. Generated from the raw snapshot,
  local-only/gitignored.
- **`config/backlog.json`, `config/token-capabilities.json`, `config/backlog-curated.json`**
  — your curated notes and probed capabilities about your real account. Gitignored.
- **`secrets/alias-map.json`** — the vault: every alias → real value the pseudonymizer has
  ever minted. Together with `CF_ALIAS_SALT` (in `.env`), this is what lets *you* reverse a
  committed alias back to a real resource. Losing it doesn't break the committed history
  (the aliases are still internally consistent), but it does mean you can't resolve them
  back to real values without re-deriving them from a fresh live capture with the same salt.

## How the pseudonymization works
`scripts/lib/idmap.mjs` runs on every `npm run snapshot`: it hashes each real id/domain/name/
email/IP with an HMAC keyed by `CF_ALIAS_SALT` (auto-generated into `.env` on first run) to
produce a stable alias, records it in `secrets/alias-map.json`, and writes the aliased result
to `snapshot.public.json`. Because it's deterministic and keyed, the same real zone always gets
the same alias in every snapshot — that's what keeps `npm run diff` and the audit-log
attribution meaningful across the committed history, without ever needing the real values.

If you're pointed at an alias and need the real thing (to run a guarded action, for instance),
`scripts/actions/_lib.mjs`'s `resolveZone()` accepts aliases directly, or look one up by hand:
```bash
node scripts/resolve.mjs zone_46147b4b        # alias -> real value
node scripts/resolve.mjs --real example.com # real value -> alias
```

## Before sharing
```bash
npm run sanitize     # removes real snapshots + local reports + real config, resets to the generic sample
# then delete local .env / .env.break-glass if they exist
```
This only matters if you're handing over a **zip of the whole working directory** rather than
a fresh git clone — gitignore already keeps every file in the 🔒 layer out of git. After
`sanitize`, only the generic `snapshots/sample` remains on disk, `reports/` and the real
`config/*.json` are emptied, and the dashboard renders placeholder data.

## Giving it to someone else
1. They clone the repo (or you share the sanitized framework).
2. They create their own **read-only** token (`docs/TOKEN-SETUP.md`) → `.env`.
3. `npm run setup && npm run refresh && npm run dashboard` — now it reflects *their* account,
   with their own fresh `CF_ALIAS_SALT` and vault.

## The repo can be public
Because only the pseudonymized `snapshot.public.json` is ever committed, keeping the GitHub
repo public no longer requires trusting redaction-by-repo-privacy. Still sensible defaults:
back up `secrets/alias-map.json` + the `CF_ALIAS_SALT` line from `.env` somewhere private (they're
your only way to reverse a committed alias), and never commit `.env*` or `secrets/` directly.
