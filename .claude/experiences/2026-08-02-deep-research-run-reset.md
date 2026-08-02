# Deep Research run reset

**What:** Added a guarded action that deletes every Deep Research job and its
foreign-key-cascaded result rows from one named D1 database.

**Why:** The product was rebuilt around separate fixed modules. The existing 14
multi-capability runs would make the new module history and shared overview
misleading. Direct Wrangler or D1 writes are forbidden by this repository's
safety model, so the reset needed a dry-run-first, audited action.

**The why, as given:** The requester asked to delete all runs so the redesigned
console starts with clean module-specific history.

**Outcome:** The action prints exact job and dependent-row counts, refuses to
delete while a job is active, requires break-glass for commit, and verifies all
run tables are empty. It preserves members, provider credentials, API tokens,
daily usage, and audit events.
