# Stray Pages preview deployment URLs: investigated, left alone

**What:** Investigated whether the landing project's preview-deployment URLs could be
eliminated so only its canonical URL stays reachable. No change made.

**Why:** The ask was "kill any dev links for the workers we have, we should ideally only have 1
url." The account also had Workers and Pages projects unrelated to this repository, so they
were excluded before any action was considered.

The landing site is a direct-upload project (`wrangler pages deploy`, no
GitHub/GitLab integration). Cloudflare's actual "disable preview deployments" field
(`source.config.preview_deployment_setting`) only exists on git-connected projects. A
direct-upload project has no `source` object, so there's no toggle to flip. Every deploy still
mints one extra `preview`-tagged deployment, each with its own permanent
`<hash>.<project>.pages.dev` URL. Cloudflare
does support deleting individual old deployment records, except the *latest* deployment for a
branch can never be deleted. The current production and current preview URLs are permanently
undeletable by design, regardless of what else gets cleaned up.

**The why, as given:** stated directly in the request - "we should ideally only have 1 url that
is the main one so no preview required for now."

**Outcome:** Presented the finding and three options (clean up deletable stale
deployments now; clean up and fold it into every future deploy; or just confirm and stop). User
chose to stop here. No script was written and nothing was deleted. The live custom domain and
the default Pages subdomain both point at the latest production
deploy regardless of how many stale URLs accumulate, so the stray URLs are dead weight rather
than a live risk.

**Lesson:** "Only one URL" is not achievable for a direct-upload Pages project on this platform.
One extra preview-tagged URL per deploy is inherent, not a misconfiguration. If this comes up
again, the fix (if ever wanted) is a new guarded `scripts/actions/pages-delete-old-deployments.mjs`
cleaning up historical records, not a project setting change. Re-check this entry first rather
than re-running the same docs research.
