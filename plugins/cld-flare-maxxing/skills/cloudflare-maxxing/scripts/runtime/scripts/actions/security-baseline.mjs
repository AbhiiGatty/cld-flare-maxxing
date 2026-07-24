#!/usr/bin/env node
/**
 * Guarded action: apply the safe zone-setting security baseline across zones.
 *   - SSL/TLS mode      → strict          (fixes Flexible + Full→Strict)
 *   - min TLS version   → 1.2
 *   - Security Level    → medium          (only if off/essentially_off)
 *   - HSTS              → on, 1y, includeSubDomains (no preload)
 *   - DNSSEC            → enable           (prints DS record for your registrar)
 *
 * DRY-RUN by default — reads current state with the READ token, changes nothing,
 * needs no break-glass. Only --commit arms break-glass and mutates.
 *
 * Flags: [--zone=<name|id>] [--only=ssl,min_tls,security_level,hsts,dnssec] [--commit]
 *
 *   node scripts/actions/security-baseline.mjs                 # dry-run, all zones
 *   CF_ALLOW_DESTRUCTIVE=YES_I_AM_SURE node scripts/actions/security-baseline.mjs --commit
 */
import { join } from 'node:path'
import { DIRS } from '../lib/paths.mjs'
import { loadEnv, log } from '../lib/util.mjs'
import { makeClient } from '../lib/cf.mjs'
import { bootEdit, parseArgs, audit } from './_lib.mjs'

const { args, commit } = parseArgs(process.argv.slice(2))
const action = 'security-baseline'
const only = args.only ? String(args.only).split(',').map((s) => s.trim()) : null
const want = (k) => !only || only.includes(k)

loadEnv(DIRS.env)
const read = makeClient({ mode: 'read' })

const TLS_RANK = { '1.0': 0, '1.1': 1, '1.2': 2, '1.3': 3 }
const settingsMap = (arr) => Object.fromEntries((arr || []).map((s) => [s.id, s.value]))

let zones = await read.getAll('/zones', { query: { per_page: 50 } })
if (args.zone) zones = zones.filter((z) => z.name === args.zone || z.id === args.zone)
if (!zones.length) { log.err('no matching zones'); process.exit(1) }

// Build per-zone change plan from live current state.
const plan = []
for (const z of zones) {
  const set = settingsMap(await read.get(`/zones/${z.id}/settings`))
  const dnssec = await read.get(`/zones/${z.id}/dnssec`).catch(() => null)
  const changes = []
  if (want('ssl') && set.ssl && set.ssl !== 'strict')
    changes.push({ kind: 'setting', id: 'ssl', from: set.ssl, to: 'strict', value: 'strict' })
  if (want('min_tls') && (TLS_RANK[set.min_tls_version] ?? 0) < 2)
    changes.push({ kind: 'setting', id: 'min_tls_version', from: set.min_tls_version, to: '1.2', value: '1.2' })
  if (want('security_level') && ['off', 'essentially_off'].includes(set.security_level))
    changes.push({ kind: 'setting', id: 'security_level', from: set.security_level, to: 'medium', value: 'medium' })
  if (want('hsts')) {
    const sts = set.security_header?.strict_transport_security
    if (!sts?.enabled || (sts.max_age || 0) < 31536000)
      changes.push({ kind: 'setting', id: 'security_header', from: sts?.enabled ? `max-age ${sts.max_age}` : 'off', to: 'on 1y +subdomains',
        value: { strict_transport_security: { enabled: true, max_age: 31536000, include_subdomains: true, nosniff: true, preload: false } } })
  }
  if (want('dnssec') && dnssec && dnssec.status === 'disabled')
    changes.push({ kind: 'dnssec', id: 'dnssec', from: 'disabled', to: 'active' })
  if (changes.length) plan.push({ zone: z, changes })
}

// Print plan
log.info(`security baseline — ${plan.length} zone(s) with changes${only ? ' (only: ' + only.join(',') + ')' : ''}`)
for (const p of plan) {
  console.log(`\n  ${p.zone.name}`)
  for (const c of p.changes) console.log(`    ${c.id.padEnd(16)} ${String(c.from).padEnd(22)} →  ${c.to}`)
}
const totalChanges = plan.reduce((n, p) => n + p.changes.length, 0)
if (totalChanges === 0) { log.ok('nothing to change — baseline already met.'); process.exit(0) }

if (!commit) {
  console.log('')
  log.warn(`DRY-RUN — ${totalChanges} change(s) across ${plan.length} zone(s). Nothing mutated.`)
  log.warn('Re-run with --commit (and break-glass armed) to apply.')
  audit({ action, status: 'DRY_RUN', summary: plan.map((p) => ({ zone: p.zone.name, changes: p.changes.map((c) => `${c.id}:${c.to}`) })) })
  process.exit(0)
}

// COMMIT
const cf = bootEdit(action, { zones: plan.map((p) => p.zone.name), changes: totalChanges })
const dsRecords = []
for (const p of plan) {
  for (const c of p.changes) {
    try {
      if (c.kind === 'setting') {
        await cf.raw('PATCH', `/zones/${p.zone.id}/settings/${c.id}`, { body: { value: c.value } })
      } else if (c.kind === 'dnssec') {
        const r = await cf.raw('PATCH', `/zones/${p.zone.id}/dnssec`, { body: { status: 'active' } })
        if (r?.result) dsRecords.push({ zone: p.zone.name, ds: r.result.ds, digest: r.result.digest, keyTag: r.result.key_tag, algorithm: r.result.algorithm })
      }
      audit({ action, status: 'COMMITTED', zone: p.zone.name, change: `${c.id}→${c.to}` })
      log.ok(`${p.zone.name}: ${c.id} → ${c.to}`)
    } catch (e) {
      audit({ action, status: 'FAILED', zone: p.zone.name, change: `${c.id}→${c.to}`, error: e.message })
      log.err(`${p.zone.name}: ${c.id} FAILED — ${e.message}`)
    }
  }
}
if (dsRecords.length) {
  console.log('\n  ── DS records to add at your domain registrar (DNSSEC) ──')
  for (const d of dsRecords) console.log(`  ${d.zone}: ${d.ds || `${d.keyTag} ${d.algorithm} 2 ${d.digest}`}`)
}
log.ok('security baseline applied. Run `npm run refresh` to recapture state.')
