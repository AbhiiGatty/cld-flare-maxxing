# Fixed-target Jan Aushadhi Metrics onboarding

**What:** Added a guarded repository action that registers exactly two Jan Aushadhi origins in
the existing GattyWorks Metrics D1 database.

**Why:** The portal needs anonymous, privacy-bounded subscription metrics, but running the
Metrics onboarding script directly would bypass Maxxing's required dry run, audit trail,
token isolation, and break-glass gate. A general D1 command action would grant far more write
scope than this release needs.

**The why, as given:** Wire GattyWorks Metrics into the mobile-first Jan Aushadhi portal for
the primary domain and its alias, while keeping all Cloudflare mutations inside the Maxxing
control path.

**Outcome:** The action accepts only an optional `--commit`. It pins the sibling Metrics
repository's onboarding script, schema, Wrangler target, manifest, and lockfile, then registers
only the approved project and origin pairs through that script. Locked install and typecheck
run before the edit token loads. The child receives only the scoped Cloudflare token and account
id, its output is withheld, and the real D1 write still requires a reviewed dry run, explicit
approval, and armed break-glass.
