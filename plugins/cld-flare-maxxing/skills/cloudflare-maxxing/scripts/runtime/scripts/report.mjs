#!/usr/bin/env node
/**
 * Insight + security report engine. Reads the latest snapshot, runs the
 * computable subset of reference/heuristics-catalog.json against it, computes
 * plan-limit utilization, and extracts change attribution from the audit log.
 *
 * Writes reports/<stamp>-report.json, reports/latest-report.json, and a
 * human-readable reports/<stamp>-report.md.
 *
 * Usage:  node scripts/report.mjs   |   npm run report
 */
import { join } from 'node:path'
import { writeFileSync, mkdirSync } from 'node:fs'
import { DIRS, snapshotDir, latestSnapshotStamp } from './lib/paths.mjs'
import { readJson, writeJson, stamp, log } from './lib/util.mjs'

const catalog = readJson(join(DIRS.reference, 'heuristics-catalog.json'), { heuristics: [] })
const CATALOG = Object.fromEntries(catalog.heuristics.map((h) => [h.id, h]))
const SEV_RANK = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }

function loadSnapshot() {
  const s = latestSnapshotStamp()
  if (!s) { log.err('No snapshot found. Run `npm run snapshot` first.'); process.exit(1) }
  const snap = readJson(join(snapshotDir(s), 'snapshot.json'))
  if (!snap) { log.err(`Snapshot ${s} unreadable.`); process.exit(1) }
  return snap
}

// ── helpers ─────────────────────────────────────────────────────────────────
const findings = []
function flag(id, resource, evidence, sevOverride) {
  const c = CATALOG[id] || {}
  findings.push({
    id,
    severity: sevOverride || c.severity || 'info',
    category: c.category || 'general',
    title: c.title || id,
    detail: c.detail || '',
    recommendation: c.recommendation || '',
    resource,
    evidence,
  })
}
const txt = (r) => String(r.content || '').replace(/^"|"$/g, '')
const isApex = (z, r) => r.name === z.name
const isWeb = (r) => ['A', 'AAAA', 'CNAME'].includes(r.type)
const isPrivateIP = (ip) =>
  /^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
  /^169\.254\./.test(ip) || ip === '::1' || /^fe80:/i.test(ip) || /^f[cd][0-9a-f]{2}:/i.test(ip)

// ── zone checks ───────────────────────────────────────────────────────────
function checkZone(z) {
  const s = z.settings || {}
  const recs = z.dnsRecords || []

  // TLS / SSL
  if (s.ssl === 'flexible') flag('tls-flexible-ssl-mode', z.name, { ssl: s.ssl })
  else if (s.ssl === 'full') flag('tls-full-not-strict', z.name, { ssl: s.ssl })
  if (['1.0', '1.1'].includes(s.min_tls_version)) flag('tls-min-version-low', z.name, { min_tls_version: s.min_tls_version })
  if (s.always_use_https === 'off') flag('tls-always-use-https-off', z.name, { always_use_https: s.always_use_https })
  if (s.automatic_https_rewrites === 'off') flag('tls-automatic-https-rewrites-off', z.name, {})
  const hsts = s.security_header?.strict_transport_security
  if (hsts && hsts.enabled !== true) flag('tls-hsts-disabled', z.name, {})
  if (s.tls_1_3 === 'off') flag('tls-opportunistic-encryption-off', z.name, { tls_1_3: 'off' })

  // Security posture
  if (z.dnssec && z.dnssec.status !== 'active') flag('sec-dnssec-disabled', z.name, { status: z.dnssec.status })
  if (s.security_level === 'off' || s.security_level === 'essentially_off') flag('sec-security-level-off', z.name, { security_level: s.security_level })
  if ((z.waf?.custom?.length || 0) === 0) flag('sec-no-waf-custom-rules', z.name, { custom: 0 })
  if ((z.waf?.managed?.length || 0) === 0) flag('sec-managed-waf-disabled', z.name, { managed: 0 })
  if ((z.waf?.rateLimit?.length || 0) === 0) flag('sec-no-rate-limiting', z.name, { rateLimit: 0 })
  if (s.browser_check === 'off') flag('sec-browser-integrity-check-off', z.name, {})

  // Performance / hygiene
  if (s.cache_level === 'bypass') flag('perf-cache-level-bypass', z.name, { cache_level: s.cache_level })
  if (s.brotli === 'off') flag('perf-brotli-off', z.name, {})
  if (s.http3 === 'off' || s.http2 === 'off') flag('perf-http2-http3-off', z.name, { http2: s.http2, http3: s.http3 })
  if (Number(s.development_mode) > 0 || s.development_mode === 'on') flag('perf-development-mode-left-on', z.name, { development_mode: s.development_mode })
  if (z.paused === true) flag('hygiene-paused-zone', z.name, { paused: true })
  if (z.status && z.status !== 'active') flag('hygiene-zone-not-active', z.name, { status: z.status })
  const meaningful = recs.filter((r) => !['NS', 'SOA'].includes(r.type))
  if (z.status === 'active' && meaningful.length === 0) flag('hygiene-orphaned-zone-no-records', z.name, { records: recs.length })

  // DNS hygiene
  for (const r of recs) {
    if (String(r.name).startsWith('*.')) flag('dns-wildcard-record-present', z.name, { name: r.name })
    if (isWeb(r) && r.proxiable && r.proxied === false && (isApex(z, r) || /^www\./.test(r.name)) && !/^_/.test(r.name)) {
      flag('dns-grey-cloud-http-record', z.name, { name: r.name, type: r.type })
    }
    if ((r.type === 'A' || r.type === 'AAAA') && r.proxied === false && isPrivateIP(String(r.content))) {
      flag('dns-a-record-unresponsive-origin', `${z.name} (${r.name})`, { content: r.content }, 'high')
    }
  }
  // duplicate / conflicting
  const byNameType = {}
  for (const r of recs) (byNameType[`${r.name}|${r.type}`] ??= []).push(r)
  for (const [k, arr] of Object.entries(byNameType)) {
    const [name, type] = k.split('|')
    if (type === 'CNAME' && (byNameType[`${name}|A`] || byNameType[`${name}|AAAA`])) flag('dns-duplicate-conflicting-records', `${z.name} (${name})`, { issue: 'CNAME coexists with A/AAAA' })
  }

  // Email: SPF / DMARC / DKIM
  const hasMX = recs.some((r) => r.type === 'MX')
  const txts = recs.filter((r) => r.type === 'TXT')
  const spf = txts.filter((r) => isApex(z, r) && /v=spf1/i.test(txt(r)))
  const dmarc = txts.find((r) => r.name === `_dmarc.${z.name}` && /v=DMARC1/i.test(txt(r)))
  const dkim = txts.some((r) => /\._domainkey/i.test(r.name) && /v=DKIM1/i.test(txt(r)))
  const sends = hasMX || spf.length > 0
  if (sends && spf.length === 0) flag('dns-spf-missing', z.name, { hasMX })
  if (spf.length > 1) flag('dns-spf-weak-all-mechanism', z.name, { issue: 'multiple SPF records', count: spf.length }, 'medium')
  if (spf.length === 1) {
    const v = txt(spf[0])
    if (/\+all\b/i.test(v)) flag('dns-spf-weak-all-mechanism', z.name, { spf: v }, 'high')
    else if (!/[~\-?+]all\b/i.test(v)) flag('dns-spf-weak-all-mechanism', z.name, { spf: v, issue: 'no all mechanism' })
  }
  if (sends && !dmarc) flag('dns-dmarc-missing', z.name, {})
  if (dmarc) {
    const v = txt(dmarc)
    const p = (v.match(/\bp=([a-z]+)/i) || [])[1]
    const hasRua = /rua=/i.test(v)
    if (p === 'none' || !hasRua) flag('dns-dmarc-policy-none-or-weak', z.name, { policy: p || 'missing', hasRua })
  }
  if (sends && !dkim) flag('dns-dkim-missing', z.name, {})
}

// ── account / access checks ─────────────────────────────────────────────────
function checkAccount(snap) {
  const members = snap.members || []
  const superAdmins = members.filter((m) => (m.roles || []).some((r) => /super administrator/i.test(r.name || '')))
  if (members.length > 15) flag('access-too-many-members', snap.account?.name, { members: members.length })
  if (members.length > 1 && superAdmins.length === members.length) flag('access-super-admin-overuse', snap.account?.name, { allSuperAdmin: true })
  for (const m of members) {
    const tfa = m.user?.two_factor_authentication_enabled
    if (tfa === false) flag('access-member-2fa-disabled', m.user?.email || m.id, {})
  }

  // Zero Trust free plan covers 50 users; crossing 50 forces the whole org
  // onto Standard ($7/user/month). Warn at 80% so the wall is never a surprise;
  // at or past the cap it's already a billing event, not a warning.
  const seats = snap.zeroTrust?.seatCount ?? snap.counts?.zeroTrustSeats
  if (seats != null) {
    if (seats >= 50) flag('cost-zero-trust-seats-over-free-cap', snap.account?.name, { seats, freeCap: 50 }, 'critical')
    else if (seats >= 40) flag('cost-zero-trust-seats-over-free-cap', snap.account?.name, { seats, freeCap: 50 })
  }

  const now = Date.now()
  const D90 = 90 * 864e5
  for (const t of snap.tokens || []) {
    const last = t.last_used_on ? Date.parse(t.last_used_on) : null
    const issued = t.issued_on ? Date.parse(t.issued_on) : null
    if ((last === null && issued && now - issued > D90) || (last && now - last > D90)) {
      flag('access-stale-api-token', t.name || t.id, { last_used_on: t.last_used_on, issued_on: t.issued_on })
    }
    if (!t.expires_on) flag('access-token-no-expiration', t.name || t.id, {})
  }
}

// ── plan-limit utilization (numeric thresholds; text from reference) ─────────
function computeLimits(snap) {
  const out = []
  const add = (metric, area, used, limit, plan) => {
    const pct = limit ? Math.round((used / limit) * 100) : null
    out.push({ metric, area, used, limit, plan, pct, status: pct == null ? 'n/a' : pct >= 95 ? 'critical' : pct >= 80 ? 'warn' : 'ok' })
  }
  const c = snap.counts || {}
  add('Workers (scripts) per account', 'Workers', c.workers || 0, 100, 'Free (500 on Paid)')
  add('KV namespaces per account', 'KV', c.kv || 0, 1000, 'all')
  add('D1 databases per account', 'D1', c.d1 || 0, 10, 'Free (50,000 on Paid)')
  add('Pages projects per account', 'Pages', c.pages || 0, 100, 'soft')
  if (c.zeroTrustSeats != null) add('Zero Trust seats (users)', 'Zero Trust', c.zeroTrustSeats, 50, 'Free ($7/user/mo Standard past 50)')
  for (const z of snap.zones || []) {
    add(`DNS records — ${z.name}`, 'DNS', (z.dnsRecords || []).length, 1000, 'Free (3,500 Pro)')
    add(`Page Rules — ${z.name}`, 'Page Rules', (z.pageRules || []).length, 5, 'Free (20 Pro)')
    add(`WAF custom rules — ${z.name}`, 'WAF', (z.waf?.custom || []).length, 5, 'Free (20 Pro)')
  }
  return out
}

// ── change attribution from audit log ────────────────────────────────────────
const SENSITIVE = /(delete|remove|revoke|create.*token|token.*create|member|role|ssl|dnssec|firewall|ruleset|disable|purge|billing|subscription)/i
function attribution(snap) {
  const log = snap.auditLog || []
  const recentSensitive = log
    .filter((e) => SENSITIVE.test(`${e.action || ''} ${e.resource || ''}`))
    .slice(0, 50)
  const byActor = {}
  for (const e of log) {
    const a = e.actor?.email || e.actor?.id || 'unknown'
    byActor[a] = (byActor[a] || 0) + 1
  }
  return { totalEntries: log.length, recentSensitive, byActor }
}

// ── main ──────────────────────────────────────────────────────────────────
function main() {
  const snap = loadSnapshot()
  log.step(`report for snapshot ${snap.stamp}`)
  for (const z of snap.zones || []) checkZone(z)
  checkAccount(snap)
  findings.sort((a, b) => (SEV_RANK[a.severity] - SEV_RANK[b.severity]) || a.category.localeCompare(b.category))

  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
  const byCategory = {}
  for (const f of findings) { bySeverity[f.severity]++; byCategory[f.category] = (byCategory[f.category] || 0) + 1 }

  const report = {
    generatedAt: new Date().toISOString(),
    snapshotStamp: snap.stamp,
    account: snap.account?.name || snap.account?.id,
    summary: { total: findings.length, bySeverity, byCategory },
    findings,
    limits: computeLimits(snap),
    attribution: attribution(snap),
    snapshotErrors: snap.errors || [],
  }

  const rstamp = stamp()
  writeJson(join(DIRS.reports, `${rstamp}-report.json`), report)
  writeJson(join(DIRS.reports, 'latest-report.json'), report)
  writeMarkdown(join(DIRS.reports, `${rstamp}-report.md`), report)

  log.ok(`report written → reports/latest-report.json`)
  log.info(`findings: ${findings.length}  (crit ${bySeverity.critical} / high ${bySeverity.high} / med ${bySeverity.medium} / low ${bySeverity.low} / info ${bySeverity.info})`)
}

function writeMarkdown(file, r) {
  const lines = []
  lines.push(`# Cloudflare account report — ${r.account}`)
  lines.push(`_Snapshot ${r.snapshotStamp} • generated ${r.generatedAt}_\n`)
  lines.push(`**${r.summary.total} findings** — `
    + `🔴 ${r.summary.bySeverity.critical} critical · 🟠 ${r.summary.bySeverity.high} high · `
    + `🟡 ${r.summary.bySeverity.medium} medium · ⚪ ${r.summary.bySeverity.low} low · ℹ️ ${r.summary.bySeverity.info} info\n`)
  const icon = { critical: '🔴', high: '🟠', medium: '🟡', low: '⚪', info: 'ℹ️' }
  for (const sev of ['critical', 'high', 'medium', 'low', 'info']) {
    const fs = r.findings.filter((f) => f.severity === sev)
    if (!fs.length) continue
    lines.push(`\n## ${icon[sev]} ${sev.toUpperCase()} (${fs.length})\n`)
    for (const f of fs) {
      lines.push(`- **${f.title}** — \`${f.resource}\``)
      if (f.recommendation) lines.push(`  - → ${f.recommendation}`)
    }
  }
  if (r.attribution.recentSensitive.length) {
    lines.push(`\n## 👤 Recent sensitive changes (who did what)\n`)
    for (const e of r.attribution.recentSensitive.slice(0, 20)) {
      lines.push(`- \`${e.when || '?'}\` **${e.action || '?'}** on ${e.resource || '?'} — by ${e.actor?.email || e.actor?.id || 'unknown'} (${e.interface || '?'})`)
    }
  }
  mkdirSync(DIRS.reports, { recursive: true })
  writeFileSync(file, lines.join('\n') + '\n')
}

main()
