# Deep Research secret rollout

**What:** The guarded Deep Research deploy action now creates one local
provider-encryption key, installs every required Worker secret before new code,
and verifies the secret names after deployment.

**Why:** The module release adds encrypted provider credentials. Deploying code
before its master key would create a short live failure window. Passing that key
through a command, log, or repository file would break the account safety model.

**The why, as given:** Architecture and security are the central premise, and the
live release must be tested through real sample runs.

**Outcome:** The key is generated once with 256 random bits and kept in the
gitignored local secrets directory. Values go to Wrangler over stdin with output
suppressed. D1 migration remains first because the old Worker ignores the new
tables and columns. Secret installation follows, then the new Worker deploys.

**Lesson:** Declare required secrets in Worker configuration, but stage them
before code that requires them. The old version can safely receive an unused
secret; the new version cannot safely start without it.
