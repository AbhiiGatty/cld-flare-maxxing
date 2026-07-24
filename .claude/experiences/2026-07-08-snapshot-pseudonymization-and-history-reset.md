# Pseudonymize committed account data; reset git history to match

**What:** Real account data (ids, zone/domain names, resource names, member/audit emails,
origin IPs) is no longer committed. `scripts/lib/idmap.mjs` deterministically aliases every
sensitive value (HMAC keyed by `CF_ALIAS_SALT`) before it's written to the committed
`snapshots/<stamp>/snapshot.public.json`. The full-fidelity raw `snapshot.json` — what
`report.mjs`/`diff.mjs`/`betas.mjs`/`build-dashboard-data.mjs`/the dashboard all actually
read — stays local and gitignored, so the day-to-day workflow is unchanged and still shows
real names. The alias↔real vault (`secrets/alias-map.json`) is local-only too; together with
the salt it's what lets the account owner reverse a committed alias back to a real value, or
resolve an alias straight to a live action (`scripts/actions/_lib.mjs` `resolveZone()` and
`scripts/resolve.mjs` both accept aliases). All 26 pre-existing snapshots were backfilled
(`scripts/alias-existing.mjs`), then the entire git history was replaced with a single fresh
orphan commit of the corrected tree, and the old GitHub release/tags/stale branches were deleted.

**Why:** The user flagged that committed snapshots contained real personal account data (their
own domains, email, member/audit-log identities) and wanted a plan to make the repo genuinely
safe to ever go public, while still being able to resolve "work on this resource" back to a
real id when asked. Chosen design (three explicit user decisions): full public-safe scope
(not just opaque ids — the real fingerprinting risk is domain names/emails/IPs), a hybrid
HMAC+local-vault reversal mechanism (deterministic so `diff.mjs`'s id-based matching keeps
working across the whole history), and re-alias the existing 26 snapshots now rather than only
future ones (so `diff` stays continuous, no exposed-vs-clean discontinuity).

Two related leaks were found and fixed along the way, beyond the original "snapshots" scope:
- `dashboard/public/data/dashboard.json` and `actions.json` were **already committed** with
  real domain names and the real account name — derived output that had the same exposure as
  the raw snapshot but wasn't covered by the existing `sanitize.mjs`. Fixed by gitignoring them
  (same pattern as `reports/`) rather than trying to scrub derived JSON separately.
- `scripts/build-actions.mjs` had the user's real project/domain names **hardcoded as literals**
  in its `CATALOG` array — inside a script `docs/SHARING.md` explicitly claims is secret-free
  shareable framework code. Moved to `config/backlog-curated.json` (gitignored, account-specific).
- `.github/workflows/daily-snapshot.yml` had the real Cloudflare account id hardcoded in a
  setup-instructions comment. Only caught by a full staged-content grep, not a filename check —
  a purely filename/path-based leak check would have missed it.

**Outcome:** Shipped. `npm run snapshot` now writes both files automatically; `npm run report`
/`diff`/`betas`/`build-dashboard-data`/the dashboard are unaffected (still read raw, local data).
`scripts/alias-existing.mjs` backfilled all 26 snapshots (560 vault entries minted, fully
deterministic — re-running produces byte-identical output). A lint pass grepped both filenames
*and* staged file content for the real email/domain/account-id/zone-id across the final
146-file tree before committing; this is what caught the CI workflow leak that a
filename-only check missed.

The entire git history (87 commits) was then replaced with one fresh orphan commit
(`git checkout --orphan`, careful `git rm -r --cached .` + re-`add -A` since `--orphan` carries
over the old index and `.gitignore` alone doesn't untrack already-tracked files), and the old
GitHub release (`v1.0.0` — a publicly-downloadable source archive independent of branch state)
and its tags were deleted, along with two stale already-merged remote branches. This was
explicitly authorized by the user ("I don't mind if we drop the git tree... history of the
commits and git branches is not important").

One residual gap was found and deliberately left open: merged PR diffs on GitHub (e.g. `gh pr
diff 4`) still show the old real data, because GitHub keeps a PR's commits reachable
independently of branch refs — replacing `main`'s history doesn't touch this. The only full fix
is deleting and recreating the GitHub repository (PRs can't be deleted individually), which
costs all PR/issue history and requires re-adding repo secrets. Given the repo is currently
**private**, the user chose to leave this as-is and revisit it specifically if the repo is ever
made public. A separate, smaller residual: three committed prose docs
(`.claude/experiences/2026-07-07-reference-terminal-structure.md`, `docs/CHANGELOG.md`,
`docs/DESIGN-SYSTEM.md`) name the user's other personal projects/domains in free-form narrative;
the user chose to leave these as-is too (project names in an operational history, not raw PII —
distinct from the structured account-fingerprinting data this change targets).

That residual decision was reversed during the 2026-07-24 public-launch review. The prose was
sanitized, and the owner authorized deleting and recreating the GitHub repository so merged
pull-request diffs cannot retain the retired commits. See
`2026-07-24-public-history-replacement.md`.

**Lesson:** A filename/path-based check for "did real data leak" is not enough — the CI workflow
leak (a real account id in a YAML comment) only surfaced when the lint pass grepped staged file
*content*, not just which paths were staged. Also: on GitHub specifically, "reset the branch
history" and "purge old data from the platform" are not the same operation — merged PRs, releases,
and tags each independently keep old commits alive and each needed separate cleanup; a plain
`git push --force` alone would have left a GitHub release still serving the old real snapshot
data as a public downloadable archive, and would not have touched old PR diffs at all.
