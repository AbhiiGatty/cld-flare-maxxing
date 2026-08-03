# Social Desk standalone deploy path

**What:** Updated the guarded Social Desk deploy action to accept the app's
standalone repo and added a migration-only release mode.

**Why:** The original action assumed Social Desk lived at `tooling/social`
inside the GattyWorks repo. The app now has its own repository. Schema changes
also need to finish before a merge can trigger the control Worker's automatic
production deployment.

**The why, as given:** The owner wants Social Desk to accept independent posts
and AI-created drafts through its own extensible workflow, then make those
changes live without bypassing the account's guarded Cloudflare path.

**Outcome:** The action detects either layout. `--migrations-only` applies
pending D1 migrations and stops before Worker deployment, so an additive schema
change can be staged safely before merging the application PR.

**Lesson:** A guarded deploy action should follow the deployable unit, not
assume it remains nested in the repository where it started.
