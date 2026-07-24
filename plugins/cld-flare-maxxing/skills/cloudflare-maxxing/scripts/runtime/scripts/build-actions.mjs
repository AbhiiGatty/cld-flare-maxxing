#!/usr/bin/env node
/**
 * Build the action catalog the dashboard's Action Center renders:
 * dashboard/public/data/actions.json
 *
 * Sources:
 *   - reports/latest-report.json      (security findings → config actions)
 *   - config/backlog-curated.json      (customer-value / perf / cost / session work —
 *                                       gitignored, account-specific; this script
 *                                       stays generic/shareable)
 *   - config/token-capabilities.json  (gates each action's canDoNow)
 *   - existing actions.json           (PRESERVES status/completedAt/note so the
 *                                      agent's completion log survives a rebuild)
 *
 * Each action defines `does` = exactly what the agent will do on that CTA.
 * Usage: node scripts/build-actions.mjs
 */
import { join } from 'node:path'
import { DIRS } from './lib/paths.mjs'
import { readJson, writeJson, log } from './lib/util.mjs'

const report = readJson(join(DIRS.reports, 'latest-report.json'), { findings: [] })
const caps = readJson(join(DIRS.root, 'config', 'token-capabilities.json'), null)
const prior = readJson(join(DIRS.dashboardData, 'actions.json'), { actions: [] })
const priorById = Object.fromEntries((prior.actions || []).map((a) => [a.id, a]))

const canEdit = (svc) => {
  if (!svc) return null
  const s = caps?.tokens?.edit?.services?.[svc]
  return s ? s.edit === true : null
}

// finding-id → action metadata. `service` maps to a capability key for gating.
const FINDING_META = {
  'tls-flexible-ssl-mode':     { cat: 'security', effort: 'low', type: 'config', service: 'zone_settings', does: ['Set SSL/TLS mode to Full (Strict) via the guarded action', 'Confirm the origin serves HTTPS first so nothing breaks'] },
  'tls-min-version-low':       { cat: 'security', effort: 'low', type: 'config', service: 'zone_settings', does: ['Set minimum TLS version to 1.2 on each affected zone'] },
  'sec-dnssec-disabled':       { cat: 'security', effort: 'med', type: 'config', service: 'dns', does: ['Enable DNSSEC on each zone', 'Hand you the DS record to paste at your registrar (manual last step)'] },
  'sec-managed-waf-disabled':  { cat: 'security', effort: 'med', type: 'config', service: 'waf', does: ['Deploy the Cloudflare Free Managed Ruleset in the managed phase'], note: 'Full Managed WAF + OWASP CRS is Pro+; free tier gets the Free Managed Ruleset' },
  'tls-hsts-disabled':         { cat: 'security', effort: 'low', type: 'config', service: 'zone_settings', does: ['Enable HSTS (max-age 1y, includeSubDomains) after confirming HTTPS everywhere'] },
  'tls-full-not-strict':       { cat: 'security', effort: 'med', type: 'config', service: 'zone_settings', does: ['Upgrade SSL mode Full → Full (Strict)'], note: 'Needs a valid origin cert (Cloudflare Origin CA is free)' },
  'sec-no-waf-custom-rules':   { cat: 'security', effort: 'med', type: 'config', service: 'waf', does: ['Add baseline WAF custom rules (admin-path lockdown, bad-bot, geo)'] },
  'sec-no-rate-limiting':      { cat: 'security', effort: 'low', type: 'config', service: 'ratelimit', does: ['Add a rate-limit rule on auth/form endpoints (e.g. 5 requests / min / IP)'] },
  'sec-security-level-off':    { cat: 'security', effort: 'low', type: 'config', service: 'zone_settings', does: ['Set Security Level to at least medium'] },
  'dns-wildcard-record-present': { cat: 'security', effort: 'low', type: 'review', service: 'dns', does: ['Review each wildcard record with you; replace with explicit records where feasible'] },
}
const IMPACT = { critical: 'critical', high: 'high', medium: 'medium', low: 'low', info: 'low' }

// curated, non-finding actions (customer value / perf / cost / session work) —
// account-specific, so it lives in config/backlog-curated.json (gitignored),
// not hardcoded here. This script stays generic/shareable framework code.
const CATALOG = (readJson(join(DIRS.root, 'config', 'backlog-curated.json'), { actions: [] }).actions || [])

const actions = []

// 1) from findings (one action per finding type, aggregated over resources)
const byId = {}
for (const f of report.findings || []) {
  const meta = FINDING_META[f.id]
  if (!meta) continue
  const a = (byId[f.id] ??= {
    id: f.id, title: f.title, category: meta.cat, impact: IMPACT[f.severity] || 'medium',
    effort: meta.effort, type: meta.type, service: meta.service, source: 'finding',
    affected: [], does: meta.does, note: meta.note || null, recommendation: f.recommendation || null,
  })
  if (f.resource && !a.affected.includes(f.resource)) a.affected.push(f.resource)
}
actions.push(...Object.values(byId))

// 2) curated
for (const c of CATALOG) actions.push({ ...c, source: 'catalog', affected: c.affected || [] })

// 2b) verified audit backlog (config/backlog.json)
const backlog = readJson(join(DIRS.root, 'config', 'backlog.json'), { actions: [] })
for (const b of backlog.actions || []) actions.push({ ...b, source: 'audit', affected: b.affected || [] })

// 3) gate + preserve status
for (const a of actions) {
  a.canDoNow = a.type === 'dashboard' ? false : canEdit(a.service)
  const p = priorById[a.id]
  a.status = p?.status || a.status || 'todo'
  a.completedAt = p?.completedAt || a.completedAt || null
  if (p?.note) a.note = p.note
}

const STATUSES = ['todo', 'in_progress', 'blocked', 'done']
const byStatus = Object.fromEntries(STATUSES.map((s) => [s, actions.filter((a) => a.status === s).length]))
const byCategory = {}
for (const a of actions) byCategory[a.category] = (byCategory[a.category] || 0) + 1

const out = {
  generatedAt: new Date().toISOString(),
  account: report.account || null,
  capabilitiesProbedAt: caps?.probedAt || null,
  stats: { total: actions.length, byStatus, byCategory, done: byStatus.done, donePct: Math.round((byStatus.done / Math.max(1, actions.length)) * 100) },
  actions: actions.sort((a, b) => {
    const o = { critical: 0, high: 1, medium: 2, low: 3 }
    return (o[a.impact] ?? 9) - (o[b.impact] ?? 9)
  }),
}
writeJson(join(DIRS.dashboardData, 'actions.json'), out)
log.ok('action catalog → dashboard/public/data/actions.json')
log.info(`${out.stats.total} actions · ${byStatus.done} done · ${byStatus.in_progress} in-progress · ${byStatus.todo} todo`)
