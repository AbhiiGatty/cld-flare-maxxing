#!/usr/bin/env node
/**
 * Beta / early-access feature advisor. Reads the curated reference/betas.json
 * and scores each feature against signals derived from the latest snapshot
 * (what your account actually uses), so you see which betas are worth testing.
 *
 * Writes reports/betas.json (and is folded into the dashboard by build-data).
 */
import { join } from 'node:path'
import { DIRS, snapshotDir, latestSnapshotStamp } from './lib/paths.mjs'
import { readJson, writeJson, log } from './lib/util.mjs'

function signals() {
  const s = latestSnapshotStamp()
  const snap = s ? readJson(join(snapshotDir(s), 'snapshot.json')) : null
  if (!snap) return { _noSnapshot: true }
  const r = snap.resources || {}
  const zones = snap.zones || []
  const usesEmailRouting = zones.some((z) => (z.dnsRecords || []).some((rec) => rec.type === 'MX' && /mx\.cloudflare\.net/i.test(String(rec.content))))
  return {
    workers: (r.workers || []).length,
    usesKV: (r.kv || []).length > 0,
    usesR2: (r.r2 || []).length > 0,
    usesD1: (r.d1 || []).length > 0,
    usesQueues: (r.queues || []).length > 0,
    usesPages: (r.pages || []).length > 0,
    usesEmailRouting,
    zones: zones.length,
    multipleWorkers: (r.workers || []).length > 1,
  }
}

// Map a beta's area to the account signal that makes it a fit.
function fitFor(beta, sig) {
  const area = (beta.area || '').toLowerCase()
  const hay = `${beta.name} ${beta.summary} ${beta.fitSignals}`.toLowerCase()
  const rules = [
    { when: /r2/.test(area) || /\br2\b/.test(hay), need: sig.usesR2, why: 'you use R2' },
    { when: /\bd1\b/.test(area), need: sig.usesD1, why: 'you use D1' },
    { when: /flag|feature flag|kv/.test(hay) && /workers|developer/.test(area), need: sig.usesKV || sig.multipleWorkers, why: 'you use KV / multiple Workers' },
    { when: /email/.test(area), need: sig.usesEmailRouting, why: 'you use Email Routing' },
    { when: /pages|full-stack|vite/.test(hay), need: sig.usesPages, why: 'you run Pages' },
    { when: /queue/.test(hay), need: sig.usesQueues || sig.usesR2, why: 'you use Queues/R2' },
    { when: /observability|placement|dev tooling|dynamic workers|workers ai|ai gateway|ai search/.test(hay), need: sig.multipleWorkers, why: 'you run multiple Workers' },
    { when: /zero trust|warp|internal dns|enterprise/.test(hay), need: false, why: 'requires Zero Trust/Enterprise — likely not a fit yet' },
    { when: /billable|budget|cost/.test(hay), need: sig.workers > 0, why: 'you have metered usage to watch' },
  ]
  for (const r of rules) {
    if (r.when) {
      if (r.need === false && /zero trust|enterprise/.test(hay)) return { fit: 'low', recommended: false, fitReason: r.why }
      return { fit: r.need ? 'high' : 'low', recommended: !!r.need, fitReason: r.need ? r.why : `no current signal (${r.why})` }
    }
  }
  return { fit: 'medium', recommended: false, fitReason: 'general platform improvement — evaluate on its merits' }
}

function main() {
  const sig = signals()
  const ref = readJson(join(DIRS.reference, 'betas.json'), { betas: [] })
  const betas = ref.betas.map((b) => ({ ...b, ...fitFor(b, sig) }))
  betas.sort((a, b) => (b.recommended - a.recommended) || ({ high: 0, medium: 1, low: 2 }[a.fit] - { high: 0, medium: 1, low: 2 }[b.fit]))
  const out = { generatedAt: new Date().toISOString(), signals: sig, betas }
  writeJson(join(DIRS.reports, 'betas.json'), out)
  const rec = betas.filter((b) => b.recommended)
  log.ok(`beta advisor → reports/betas.json`)
  log.info(`${rec.length}/${betas.length} betas look like a fit for your stack:`)
  for (const b of rec.slice(0, 12)) log.dim(`   • ${b.name} (${b.area}) — ${b.fitReason}`)
}

main()
