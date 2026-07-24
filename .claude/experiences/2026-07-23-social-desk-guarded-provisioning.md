# Social Desk guarded provisioning

**What:** Added an idempotent guarded action that provisions only the Social
Desk D1 database and exact-email Cloudflare Access application.

**Why:** A private social dashboard is moving from one laptop to a private
Worker. Account mutations must still go through this repo's break-glass,
dry-run-first, audited path. Combining database creation, Access, Worker
deployment, secrets, and migrations in one action would make partial failure
harder to reason about.

**The why, as given:** The owner wants the dashboard on Cloudflare with SSO for
two Admin accounts and one Publisher account. The existing Cloudflare manager
repo should remain the account-control path.

**Outcome:** `social-desk-provision.mjs` creates or reuses the caller-named D1 database and
Access app, then verifies one exact-email Allow policy. Resource names, the domain, and operator
addresses are caller-supplied and stay out of public source. `social-desk-deploy.mjs` is the
separate guarded action for D1 migrations, the Worker, and its custom domain. Meta secrets stay
separate.

**Lesson:** Provision the control plane first and emit its non-secret IDs.
Commit those bindings into the application config before the guarded Worker
deploy. This keeps every mutation reviewable and restartable.

The deploy action also installs the Social Desk's locked dependencies before
building. A clean application worktree must deploy without depending on a
pre-existing `node_modules` folder.

Meta values use a third guarded action. It reads exactly four named values
from a caller-supplied local env file, passes them to `wrangler secret bulk`
through a permission-restricted temporary JSON file, verifies secret names
only, and removes the temporary file. Values never enter logs or audit data.
