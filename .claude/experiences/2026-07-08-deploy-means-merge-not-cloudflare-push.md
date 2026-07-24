# "Deploy it" means merge to main, not run the Cloudflare Pages action

**What:** Corrected a misread. Asked to "deploy it," interpreted that as the literal
Cloudflare Pages action (`scripts/actions/pages-deploy-site.mjs --commit`) and ran it: dry-run,
break-glass, the works, including troubleshooting an unrelated stuck process along the way.
Told directly afterward that's not what "deploy it" meant - it meant finish the git workflow
(commit, PR, merge to `main`) for whatever was already sitting committed.

**Why this reads as ambiguous but has a clear default:** this repo has two real things both
casually called "deploying" - landing code in git (frequent, low-ceremony, happens many times
a session) and actually pushing `site/` live to Cloudflare (rare, break-glass, a real account
mutation). Nothing in the word "deploy" itself disambiguates them. Defaulted to the heavier,
less frequent interpretation instead of the one that matches how the word had actually been
used throughout the rest of the session (every prior "merge it off" meant the git workflow).

**Outcome:** Documented directly in `CLAUDE.md`/`AGENTS.md` ("Vocabulary: what 'deploy it'
actually means") so this doesn't need re-litigating: bare "deploy it" / "ship it" / "merge it"
defaults to the PR-merge workflow; the actual Cloudflare push only runs when the request
names the live site explicitly ("deploy to Cloudflare," "push it live," etc.).

**Lesson:** When a repo has two genuinely different operations that share a common casual
name, and one is far more frequent/lower-stakes than the other, default to the frequent one
and require explicit language for the rarer, higher-stakes one - don't default to whichever
interpretation is technically more literal or more powerful. This is the same shape as
picking the safer, more reversible action when a request is ambiguous (see
`2026-07-08-repo-renamed-to-match-product-name.md` for a case going the other way: an
explicit "I approve it" removed the ambiguity, so the heavier action was correct there).
