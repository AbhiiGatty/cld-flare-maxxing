# GitHub repo and npm package renamed to match the product name

**What:** Renamed the GitHub repository from `cldflare-maxxing` to `cld-flare-maxxing` (via
`gh repo rename`), updated the local git remote, and renamed the npm package
(`package.json` `name`) to match. Updated every hardcoded reference to the old GitHub URL
across the repo (`AGENTS.md` title, `README.md`, `docs/SHARING.md`, `docs/DESIGN-SYSTEM.md`,
and five separate string literals in `site/index.html`'s terminal-demo transcript).

**Why:** Requested directly, with explicit approval given in the same message ("I approve
it") - this is a GitHub account-setting change, which normally needs that explicit
confirmation before acting. The repo folder/package name and the product name had been a
known, intentionally-documented mismatch (`cldflare-maxxing` vs `cld-flare-maxxing`) since
the brand refresh; this closes that gap.

**What was deliberately left unchanged**, despite matching the search pattern: the Cloudflare
**Pages project** name (`cldflare-maxxing-site`, in `scripts/actions/pages-deploy-site.mjs`'s
default and reflected in `dashboard/public/data/dashboard.json`) is a separate live
Cloudflare-side resource, unrelated to the GitHub repo's name - renaming the GitHub repo has
no effect on it, and renaming *that* would be a real Cloudflare mutation requiring its own
break-glass consideration, not something to bundle into a GitHub rename. Also left alone: all
`snapshots/*.json` (point-in-time historical records, never edited after the fact) and the
generated `dashboard.json` (rebuilds naturally from snapshots).

**Outcome:** Shipped. Verified before treating it as safe: checked whether this repo's
deploy path depends on the GitHub repo name at all (it doesn't - `site/` deploys via a manual
`wrangler pages deploy` CLI call, not a GitHub-integration auto-deploy, and GitHub Actions
survive a rename since they're tied to the repo's internal ID). Confirmed the old URL still
resolves via GitHub's automatic redirect for authenticated access after the rename. Confirmed
`git fetch` works against the updated remote. Re-ran the terminal-popup transcript in a live
preview afterward and confirmed every link/label uses the new name with no leftover old-name
strings, and that the y/n interaction flow still works end to end.

**Not done, can't safely be done from here:** the actual local Windows folder
(`.../cldflare-maxxing`) was not renamed - this session runs from inside that directory, and
renaming a directory that's a running process's working directory (doubly so under OneDrive
sync) is not something to attempt via an agent's own shell mid-session. Told the user to
rename it themselves once the terminal/editor session pointed at the old path is closed.

**Lesson:** When a rename/search-replace touches many files, don't blindly replace every
string match - grep broadly first, then classify each hit (this repo's own name vs. a
same-named-but-unrelated live resource vs. immutable historical data) before touching
anything. A naive find-and-replace here would have silently renamed a live Cloudflare Pages
project reference and corrupted historical snapshot records.
