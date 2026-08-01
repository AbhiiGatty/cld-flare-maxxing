# Preview deployments shut off account-wide, 765 stray URLs deleted

**What:** Disabled preview deployments on all 5 Pages projects and preview URLs on the 3
Workers that had them, then deleted every historical preview deployment (765 across two
passes). Zero preview URLs remain reachable; production untouched and verified live.

**Why:** The ask: nothing on the account needs preview deployments for now, so audit all and
remove any present. Supersedes [[2026-07-10-pages-preview-urls-left-alone]] on two facts that
changed since July: every Pages project (including the landing site) is now git-connected, so
the `preview_deployment_setting` toggle applies everywhere; and the user's stance moved from
"confirm and stop" to "remove them".

The audit also caught the July footgun still live: gattyworks and cldflare-maxxing-site both
had `preview_deployment_setting: "none"` yet kept building previews (gattyworks built one 25
minutes before the audit), because `preview_branch_includes: ["*"]` was never cleared and the
wildcard wins. `pages-preview-toggle.mjs` was fixed to rewrite the setting and both branch
lists together, the way dashboard saves do.

**The why, as given:** "no worker or anything requires preview deployment for now so audit
all and remove it any are present."

**Outcome:** Three script changes, all dry-run first, committed via break-glass, verified
after:

- `pages-preview-toggle.mjs` (fixed): now writes `preview_deployment_setting` +
  `preview_branch_includes` + `preview_branch_excludes` atomically. All 5 projects set to
  `none` + `[]`, re-read to confirm both fields.
- `worker-preview-toggle.mjs` (new): flips `subdomain.previews_enabled` per script without
  touching `subdomain.enabled` (the production workers.dev hostname, which serves real
  traffic on some Workers). build-notifier, edible-factor-web, fearofwife-com previews off.
- `pages-delete-preview-deployments.mjs` (new): deletes preview-environment deployments with
  `force=true`, never production. First pass 656, second pass 109 (the deployments list
  paginates and the first sweep capped at 1000 records on gattyworks), third pass clean -
  run it until it reports nothing to change, don't trust one pass on a big project. Zero were
  refused by the latest-per-branch rule, likely because those branches were merged/deleted.
  Spot-checked an old preview URL (404) and production (200) after.

**Lesson:** The "latest preview per branch is undeletable" platform rule from the July entry
turned out not to bite when branches no longer exist - the rule is per live branch head, so
post-merge cleanup can reach zero. And any sweep over Pages deployments must loop until dry:
the list endpoint pages at 25 and big projects exceed single-sweep caps silently.
