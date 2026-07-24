# Public history requires repository replacement

**What:** Chose to replace the private GitHub repository with a new private repository at the
same owner/name, backed by a single clean root commit.

**Why:** The 2026-07-08 history reset removed old blobs from branch history, tags, and releases,
but GitHub still keeps commits reachable through merged pull-request diffs. Those pull requests
cannot be deleted individually. A force-push therefore cannot provide a complete purge before
the repository becomes public.

**The why, as given:** The owner said it is okay to delete and recreate the repository entirely
if that is required. The current public-launch review confirmed that it is required.

**Outcome:** The release tree was hardened, scanned, committed, and converted into a one-commit
root candidate. A clean clone of that candidate passed `npm ci`, all 14 tests, both dependency
audits, and the dashboard production build. A complete private Git bundle of the old history was
created outside the repository and verified. After the owner granted GitHub's separate
`delete_repo` OAuth scope, the old repository was deleted and a different repository object was
created at the same owner/name with private visibility. The clean root was then pushed as its
only commit. Repository metadata, Actions secrets, security settings, topics, and the first
release were restored after the push.

**Lesson:** Rewriting refs is not the same as removing data from a forge. Pull-request objects
can retain commits independently of branches, so public-release planning must cover the hosting
platform's retained objects as well as the Git graph.
