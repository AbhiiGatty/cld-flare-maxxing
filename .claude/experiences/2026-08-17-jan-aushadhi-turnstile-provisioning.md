# Fixed Jan Aushadhi Turnstile provisioning

**What:** Added a guarded action that creates the dedicated Jan Aushadhi price-watch widget
or rotates its secret when the exact widget already exists, then installs that secret on the
fixed Worker.

**Why:** The live page disabled price watch because its production build had no public site
key. The account had no widget for either Jan Aushadhi hostname. Creating one from Wrangler or
the dashboard would bypass Maxxing's dry run, target lock, token isolation, and audit record.

**The why, as given:** Make the Jan Aushadhi UI work live and use the Cloudflare Maxxing and
Metrics repositories to fix the missing production wiring.

**Outcome:** The action pins the sibling repository, Worker, widget name, two hostnames,
settings, and Wrangler files. It refuses overlapping widget domains. Widget secrets pass to
Wrangler on stdin and never enter logs or audit records. The action still needs an approved
`--commit` run before any live state changes.
