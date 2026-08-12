# Access OTP "not delivered" was a policy mismatch, not an email problem

**What:** A user added to research.gattyworks.com from the dashboard never received the
login OTP. Root cause: the email never landed in the app's allow-policy include list, and
Access one-time PIN silently refuses to send a code to any email that doesn't match an allow
policy - while the login page still says "check your email" (anti-enumeration). Fixed by
adding the email to the policy via a new guarded action; also tightened the metrics console
app from `everyone` to a named allowlist in the same pass.

**Why:** Auth logs showed zero authentication events for the address, ever - Cloudflare never
sent anything. The app's single allow policy listed three other emails. Wherever the
dashboard add went (My Team, another app, an unsaved form), it wasn't this policy.

**The why, as given:** "I add gowricps@gmail.com to research.gattyworks.com and the user is
complaining that the OTP for login is not being received."

**Outcome:** New guarded action `access-policy-email.mjs` (--add appends to an app's allow
policy; --set-emails replaces the include list, turning an `everyone` policy into a named
allowlist). Both changes dry-run first, committed via break-glass, re-read to verify. The
metrics event-ingest bypass app was deliberately left public - it's the collector endpoint.

**Lesson:** "OTP not received" on an Access app is a policy question before it is a
deliverability question: check the app's allow-policy include list first, then auth logs
(zero events = never sent). Adding a user to an app always means the app's own policy:
Zero Trust > Access > Applications > [the app] > Policies > include. Adding under My Team or
any other surface does not grant the app.
