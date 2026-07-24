# snapshots/

Versioned, point-in-time captures of the full Cloudflare account: DNS, zones, WAF, security
settings, resources, and the audit log. This is the primary data the rest of the repo is built
on, produced by `scripts/snapshot.mjs` (`npm run snapshot`).

Each dated folder holds two files:

| Path | What it is |
|---|---|
| `<ISO-timestamp>/snapshot.json` | the full-fidelity **local, gitignored** capture — real ids, domains, names, emails, IPs. What `report.mjs`, `diff.mjs`, `betas.mjs`, `build-dashboard-data.mjs`, and the dashboard all read. |
| `<ISO-timestamp>/snapshot.public.json` | the **committed** sibling — every real id/domain/name/email/IP replaced with a deterministic alias (`scripts/lib/idmap.mjs`). This is the actual versioned account-state record that lives in git. |
| `sample/` | a generic, account-free snapshot so the dashboard renders placeholder data on a fresh clone, restored by `npm run sanitize` |
| `index.json` | bookkeeping for which snapshot is "latest," maintained by `scripts/lib/paths.mjs` |

Aliases are reversible offline via `secrets/alias-map.json` + `CF_ALIAS_SALT` (both gitignored,
personal) — see `docs/SHARING.md`. Token *values* are never captured inside a snapshot, only
token metadata. See the "Snapshot schema" section of `docs/ARCHITECTURE.md` for what's inside
the JSON itself.
