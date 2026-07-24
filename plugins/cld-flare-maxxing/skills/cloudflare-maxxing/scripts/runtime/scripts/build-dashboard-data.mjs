#!/usr/bin/env node
/**
 * Consolidate the latest snapshot + report + beta advisor + reference tables
 * into a single dashboard/public/data/dashboard.json that the React dashboard
 * reads. Keeps the UI dependency-free of the raw (large) snapshots.
 */
import { join } from 'node:path'
import { DIRS, snapshotDir, latestSnapshotStamp, SNAPSHOT_INDEX } from './lib/paths.mjs'
import { readJson, writeJson, log } from './lib/util.mjs'

function main() {
  const s = latestSnapshotStamp()
  if (!s) { log.err('No snapshot. Run `npm run snapshot` first.'); process.exit(1) }
  const snap = readJson(join(snapshotDir(s), 'snapshot.json'))
  const report = readJson(join(DIRS.reports, 'latest-report.json'), null)
  const betas = readJson(join(DIRS.reports, 'betas.json'), { betas: [] })
  const limitsRef = readJson(join(DIRS.reference, 'limits.json'), { limits: [] })
  const index = readJson(SNAPSHOT_INDEX, { runs: [] })

  // Per-zone slim view + each zone's findings.
  const zoneFindings = {}
  for (const f of report?.findings || []) {
    const z = String(f.resource || '').split(' ')[0]
    ;(zoneFindings[z] ??= []).push({ id: f.id, severity: f.severity, title: f.title })
  }
  const zones = (snap.zones || []).map((z) => {
    const recs = z.dnsRecords || []
    return {
      id: z.id,
      name: z.name,
      status: z.status,
      paused: z.paused,
      plan: z.plan,
      ssl_mode: z.ssl_mode,
      dnssec: z.dnssec?.status ?? null,
      records: recs.length,
      proxied: recs.filter((r) => r.proxied).length,
      wafCustom: z.waf?.custom?.length || 0,
      wafManaged: z.waf?.managed?.length || 0,
      rateLimit: z.waf?.rateLimit?.length || 0,
      pageRules: (z.pageRules || []).length,
      securityEvents: (z.securityEvents || []).reduce((n, g) => n + (g.count || 0), 0),
      findings: zoneFindings[z.name] || [],
    }
  })

  const dashboard = {
    generatedAt: new Date().toISOString(),
    snapshotStamp: snap.stamp,
    snapshotGeneratedAt: snap.generatedAt,
    account: snap.account?.name || snap.account?.id,
    counts: snap.counts || {},
    summary: report?.summary || { total: 0, bySeverity: {}, byCategory: {} },
    findings: report?.findings || [],
    limits: report?.limits || [],
    attribution: report?.attribution || { recentSensitive: [], byActor: {} },
    zones,
    resources: {
      workers: (snap.resources?.workers || []).map((w) => ({ name: w.id || w.name, modified_on: w.modified_on, schedules: w.schedules || [] })),
      kv: (snap.resources?.kv || []).map((k) => ({ id: k.id, title: k.title })),
      r2: (snap.resources?.r2 || []).map((b) => ({ name: b.name, creation_date: b.creation_date })),
      d1: (snap.resources?.d1 || []).map((d) => ({ name: d.name, uuid: d.uuid })),
      pages: (snap.resources?.pages || []).map((p) => ({ name: p.name })),
      queues: (snap.resources?.queues || []).map((q) => ({ name: q.queue_name || q.name })),
    },
    members: (snap.members || []).map((m) => ({ email: m.user?.email, status: m.status, roles: (m.roles || []).map((r) => r.name), tfa: m.user?.two_factor_authentication_enabled })),
    tokens: (snap.tokens || []).map((t) => ({ name: t.name, status: t.status, last_used_on: t.last_used_on, expires_on: t.expires_on })),
    betas: betas.betas || [],
    planLimitsReference: limitsRef.limits || [],
    history: (index.runs || []).slice(0, 30).map((r) => ({ stamp: r.stamp, generatedAt: r.generatedAt, counts: r.counts })),
    snapshotErrors: snap.errors || [],
  }

  writeJson(join(DIRS.dashboardData, 'dashboard.json'), dashboard)
  log.ok(`dashboard data → dashboard/public/data/dashboard.json`)
  log.info(`zones ${zones.length} · findings ${dashboard.summary.total} · betas ${dashboard.betas.length}`)
}

main()
