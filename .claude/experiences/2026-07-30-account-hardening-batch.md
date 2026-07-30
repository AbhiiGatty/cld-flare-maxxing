# Account hardening batch: alerts, rate limits, WAF, CPU caps, SSL baseline

**What:** One approved batch of guarded mutations across the whole account: notification
policies, baseline per-IP rate limits, the free Managed WAF ruleset on all zones, per-Worker
CPU caps, and the zone security baseline (SSL strict, HSTS, DNSSEC). Findings went 30 to 11
in one pass.

**Why:** Right after the Workers Paid upgrade ([[2026-07-30-free-tier-audit-and-workers-paid]])
the account had no usage alarms (Cloudflare enables none by default, even after buying a
plan), no spend cap exists as a product feature, and the audit's security findings (Flexible
SSL, no WAF anywhere, DNSSEC off) were still open. Paid overage without alerting means abuse
bills silently.

**The why, as given:** "can we setup hard limits? setup everything you think is best for the
account and secures us and builds robustness."

**Outcome:** All committed via break-glass, audited, verified live afterward (every domain
still serving; findings 30 to 11 on the post-change snapshot):

- `alerting-setup.mjs` (new): billing_usage_alert at 8M Workers requests (80% of the 10M
  included) + dos_attack_l7, email delivery. Two footguns found: account-scoped tokens 403 on
  GET /user (so --email is explicit), and billing_usage_alert rejects creation without
  product+limit filters (Error 17103) while available_alerts reports its AvailableValues as
  null - the slug worker_requests is accepted.
- `zone-rate-limit.mjs` (new): 300 req/10s per-IP block on 4 zones (free plan includes one
  http_ratelimit rule; ediblefactor.com already used its slot, skipped by design).
- `waf-managed-deploy.mjs` (existing): Cloudflare Managed Free Ruleset deployed on all 5 zones.
- `worker-cpu-limit.mjs` (new): per-script cpu_ms caps on all 12 Workers (500ms default,
  1000ms social-desk, 2000ms edible-factor-web and deep-research - always above measured P99,
  far below the 30s plan ceiling), so one runaway Worker can't drain the 30M ms/month pool.
- `security-baseline.mjs` (existing): SSL strict everywhere, HSTS 1y+subdomains, DNSSEC
  enabled on the three zones that lacked it.

Still needs the human: DS records at the registrar for ediblefactor.com, fearofwife.com,
fearofwife.in (printed in the action output and re-printable via a dry run) - DNSSEC is
enabled at Cloudflare but not anchored until the registrar has them.

**Lesson:** Cloudflare has no spend cap; the closest real substitute is layered - usage
alerts (must be created, never default), per-Worker CPU caps, per-IP rate limits, and WAF.
Also: "setup everything" still went one dry-run-then-commit action at a time with a live
verify after the riskiest change (SSL strict), which is what made a 13-change batch safe to
run unattended.
