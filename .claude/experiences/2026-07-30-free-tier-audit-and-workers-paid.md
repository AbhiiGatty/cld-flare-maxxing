# Free-tier audit found two real walls; fixed one with $5 instead of engineering

**What:** Audited free-tier quota consumption across the whole account (live GraphQL/REST
numbers, 23 quotas), then upgraded the account to Workers Paid ($5/month) as the fix for two
of the three hot findings.

**Why:** The audit found: Pages builds blown (~691 against 500/month, gattyworks alone 495,
production+preview pairs per push on a news site that publishes per-article); one Worker
(edible-factor-web) over the free 10ms CPU budget at P50 (17-45ms, P99 675ms), so it fails
under growth regardless of quotas; everything else under 12% with wide headroom. Options laid
out for the builds: kill previews, batch publishing, decouple articles from builds via D1, or
pay $5. Along the way found gattyworks already had `preview_deployment_setting: "none"` set
but previews still built - `preview_branch_includes: ["*"]` was never cleared, and the wildcard
wins. Dashboard saves write both fields consistently; raw API updates don't.

**The why, as given:** "I think 5usd per month is solid" after seeing the ladder of options and
what else the plan includes; publishing latency matters to a news site, so batching and the
D1 decouple lost to the zero-engineering option.

**Outcome:** User purchased Workers Paid in the dashboard (billing stays in human hands, edit
token has no billing scope). Verified via API: `workers_paid` $5/monthly active, plus an
auto-attached `$0` R2 Paid pay-as-you-go rider (normal, bills nothing at 11.7 MB). All quotas
pool account-wide - one subscription covers every Worker, Pages project, and domain. Zone
plans are a separate per-domain product and stayed free.

What the $5 concretely buys, against measured usage at purchase time:

| Quota | Free | Paid | Measured need |
|---|---|---|---|
| Pages builds | 500/month, 1 concurrent | 5,000/month, 5 concurrent | ~691 used in July; quota was already blown |
| Workers CPU | 10ms/invocation | 30s/invocation | edible-factor-web P50 17-45ms; was failing the limit at median |
| Workers requests | 100k/day | 10M/month (~333k/day) | ~10k/day, doubling monthly; runway years not months |
| D1 rows written | 100k/day | 50M/month (~1.6M/day) | 32k peak day; 16x headroom on peaks |
| D1 rows read | 5M/day | 25B/month | 572k peak day; ceiling irrelevant now |
| KV ops | 100k reads / 1k writes per day | 10M / 1M per month | unused today, unblocks the planned request-path-to-KV refactor |
| Durable Objects | restricted | full access, 1M req/month | new capability, not yet used |

The two audit findings marked "hot" (builds blown, CPU over budget) are both closed by this
one change, with zero engineering time. The alternatives it replaced: build-batching (hours of
process change plus publish latency a news site didn't want) and a D1-backed article decouple
(days of refactor). Still open from the audit: Flexible SSL on abhiigatty.com (the one
critical), no managed WAF on any zone, DNSSEC gaps - config fixes, not money fixes. Full
report: `reports/free-tier-audit-2026-07-29.md` (local-only).

**Lesson:** Quota problems split into config debt, architectural defects, and capacity trends,
and the fix type differs per class - the builds blowout was process (publish-per-push), the
CPU overrun was architecture (compute in the request path), and $5/month legitimately beat
both engineering fixes on effort-for-value. Also: a Pages branch-control setting changed via
raw API can silently disagree with itself (`none` + includes `["*"]` = previews still build);
check both fields, or use the dashboard for that setting.
