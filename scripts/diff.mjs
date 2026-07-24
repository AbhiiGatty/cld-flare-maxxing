#!/usr/bin/env node
/**
 * Diff two snapshots and attribute the changes. Defaults to the two most
 * recent snapshots; or pass two stamps:  node scripts/diff.mjs <oldStamp> <newStamp>
 *
 * Reports added/removed/changed DNS records, zone-setting changes, and
 * added/removed resources — then correlates with audit-log actors from the
 * newer snapshot so you can see WHO likely made each change.
 */
import { join } from 'node:path'
import { DIRS, snapshotDir, SNAPSHOT_INDEX } from './lib/paths.mjs'
import { readJson, writeJson, stamp, log } from './lib/util.mjs'

function pickStamps() {
  const [a, b] = process.argv.slice(2)
  if (a && b) return [a, b]
  const idx = readJson(SNAPSHOT_INDEX, { runs: [] })
  const runs = (idx.runs || []).map((r) => r.stamp)
  if (runs.length < 2) { log.err('Need at least two snapshots to diff. Run `npm run snapshot` again later.'); process.exit(1) }
  return [runs[1], runs[0]] // [older, newer]
}

const load = (s) => {
  const snap = readJson(join(snapshotDir(s), 'snapshot.json'))
  if (!snap) { log.err(`Snapshot ${s} not found.`); process.exit(1) }
  return snap
}

const recKey = (r) => `${r.name}|${r.type}`
const recVal = (r) => `${r.content}|ttl=${r.ttl}|proxied=${r.proxied}|prio=${r.priority ?? ''}`

function diffZone(oldZ, newZ) {
  const changes = []
  const o = Object.fromEntries((oldZ?.dnsRecords || []).map((r) => [r.id || recKey(r) + '|' + recVal(r), r]))
  const n = Object.fromEntries((newZ?.dnsRecords || []).map((r) => [r.id || recKey(r) + '|' + recVal(r), r]))
  // by id when available
  const oById = Object.fromEntries((oldZ?.dnsRecords || []).filter((r) => r.id).map((r) => [r.id, r]))
  const nById = Object.fromEntries((newZ?.dnsRecords || []).filter((r) => r.id).map((r) => [r.id, r]))
  for (const id of Object.keys(nById)) {
    if (!oById[id]) changes.push({ kind: 'dns.added', record: `${nById[id].type} ${nById[id].name}`, to: recVal(nById[id]) })
    else if (recVal(oById[id]) !== recVal(nById[id])) changes.push({ kind: 'dns.changed', record: `${nById[id].type} ${nById[id].name}`, from: recVal(oById[id]), to: recVal(nById[id]) })
  }
  for (const id of Object.keys(oById)) if (!nById[id]) changes.push({ kind: 'dns.removed', record: `${oById[id].type} ${oById[id].name}`, from: recVal(oById[id]) })

  // settings changes (key ones)
  const watch = ['ssl', 'min_tls_version', 'always_use_https', 'security_level', 'cache_level', 'development_mode', 'brotli']
  for (const k of watch) {
    const ov = oldZ?.settings?.[k]
    const nv = newZ?.settings?.[k]
    if (JSON.stringify(ov) !== JSON.stringify(nv)) changes.push({ kind: 'setting.changed', setting: k, from: ov, to: nv })
  }
  if (oldZ?.dnssec?.status !== newZ?.dnssec?.status) changes.push({ kind: 'dnssec.changed', from: oldZ?.dnssec?.status, to: newZ?.dnssec?.status })
  if (oldZ?.paused !== newZ?.paused) changes.push({ kind: 'zone.paused', from: oldZ?.paused, to: newZ?.paused })
  return changes
}

function diffList(oldArr, newArr, keyFn, label) {
  const o = new Set((oldArr || []).map(keyFn))
  const n = new Set((newArr || []).map(keyFn))
  const out = []
  for (const k of n) if (!o.has(k)) out.push({ kind: `${label}.added`, item: k })
  for (const k of o) if (!n.has(k)) out.push({ kind: `${label}.removed`, item: k })
  return out
}

function main() {
  const [olderS, newerS] = pickStamps()
  const a = load(olderS), b = load(newerS)
  log.step(`diff ${olderS} → ${newerS}`)

  const zonesA = Object.fromEntries((a.zones || []).map((z) => [z.id, z]))
  const zonesB = Object.fromEntries((b.zones || []).map((z) => [z.id, z]))
  const perZone = {}
  for (const id of new Set([...Object.keys(zonesA), ...Object.keys(zonesB)])) {
    const name = zonesB[id]?.name || zonesA[id]?.name || id
    if (!zonesA[id]) { perZone[name] = [{ kind: 'zone.added', zone: name }]; continue }
    if (!zonesB[id]) { perZone[name] = [{ kind: 'zone.removed', zone: name }]; continue }
    const c = diffZone(zonesA[id], zonesB[id])
    if (c.length) perZone[name] = c
  }

  const resourceChanges = [
    ...diffList(a.resources?.workers, b.resources?.workers, (w) => w.id || w.name, 'worker'),
    ...diffList(a.resources?.kv, b.resources?.kv, (k) => k.title || k.id, 'kv'),
    ...diffList(a.resources?.r2, b.resources?.r2, (r) => r.name, 'r2'),
    ...diffList(a.resources?.d1, b.resources?.d1, (d) => d.name || d.uuid, 'd1'),
    ...diffList(a.resources?.pages, b.resources?.pages, (p) => p.name, 'pages'),
    ...diffList(a.members, b.members, (m) => m.user?.email || m.id, 'member'),
    ...diffList(a.tokens, b.tokens, (t) => t.id, 'token'),
  ]

  // Attribution: sensitive audit entries from the newer snapshot, in window.
  const since = Date.parse(a.generatedAt)
  const attribution = (b.auditLog || []).filter((e) => {
    const t = e.when ? Date.parse(e.when) : NaN
    return !isNaN(t) && t >= since
  }).slice(0, 100)

  const total = Object.values(perZone).reduce((n, c) => n + c.length, 0) + resourceChanges.length
  const diff = { generatedAt: new Date().toISOString(), from: olderS, to: newerS, totalChanges: total, zones: perZone, resources: resourceChanges, attribution }

  const file = join(DIRS.reports, `${stamp()}-diff.json`)
  writeJson(file, diff)
  writeJson(join(DIRS.reports, 'latest-diff.json'), diff)
  log.ok(`${total} change(s) → ${file.replace(DIRS.root, '.')}`)
  for (const [zone, cs] of Object.entries(perZone)) {
    log.info(`zone ${zone}: ${cs.length} change(s)`)
    for (const c of cs.slice(0, 10)) log.dim('   ' + JSON.stringify(c))
  }
  for (const c of resourceChanges) log.dim('   ' + JSON.stringify(c))
  if (attribution.length) log.info(`${attribution.length} audit-log entr(ies) in this window (see diff.attribution for who)`)
}

main()
