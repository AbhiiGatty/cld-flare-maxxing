#!/usr/bin/env node
/**
 * Full read-only snapshot of a Cloudflare account + all its zones.
 * Writes snapshots/<stamp>/snapshot.json and updates snapshots/index.json.
 *
 * Resilient by design: every collector is wrapped so a missing token scope
 * records an error and keeps going instead of aborting the whole run.
 *
 * Usage:  node scripts/snapshot.mjs            (uses CF_READ_TOKEN)
 *         npm run snapshot
 */
import { join } from 'node:path'
import { DIRS, snapshotDir, recordSnapshot } from './lib/paths.mjs'
import { loadEnv, writeJson, stamp, redact, log } from './lib/util.mjs'
import { makeClient, resolveAccountId } from './lib/cf.mjs'
import { aliasSnapshot, loadVault, saveVault } from './lib/idmap.mjs'

loadEnv(join(DIRS.root, '.env'))

const DAYS_AUDIT = Number(process.env.CF_AUDIT_DAYS || 30)
const DAYS_SECURITY = Number(process.env.CF_SECURITY_DAYS || 7)
const ZONE_CONCURRENCY = 4

const errors = []
async function safe(scope, label, fn) {
  try {
    return await fn()
  } catch (e) {
    errors.push({ scope, label, message: e.message, status: e.status || null })
    log.warn(`skip ${scope}/${label}: ${e.message}`)
    return null
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length || 1) }, async () => {
      while (i < items.length) {
        const idx = i++
        out[idx] = await fn(items[idx], idx)
      }
    })
  )
  return out
}

function settingsArrayToMap(arr) {
  const m = {}
  for (const s of arr || []) m[s.id] = s.value
  return m
}

const SECURITY_GQL = `query($zoneTag:String!,$start:Time!,$end:Time!){
  viewer{ zones(filter:{zoneTag:$zoneTag}){
    firewallEventsAdaptiveGroups(filter:{datetime_geq:$start,datetime_leq:$end},limit:50,orderBy:[count_DESC]){
      count dimensions{ action source clientCountryName }
    }
  }}
}`

async function collectZone(cf, zone) {
  const z = {
    id: zone.id,
    name: zone.name,
    status: zone.status,
    paused: zone.paused,
    type: zone.type,
    plan: zone.plan?.name || zone.plan?.legacy_id || null,
    name_servers: zone.name_servers,
    original_name_servers: zone.original_name_servers,
  }

  const settingsArr = await safe('zone', `settings:${zone.name}`, () => cf.get(`/zones/${zone.id}/settings`))
  z.settings = settingsArrayToMap(settingsArr)
  z.ssl_mode = z.settings.ssl ?? null

  z.dnssec = await safe('zone', `dnssec:${zone.name}`, () => cf.get(`/zones/${zone.id}/dnssec`))
  z.dnsRecords = (await safe('zone', `dns:${zone.name}`, () => cf.getAll(`/zones/${zone.id}/dns_records`, { query: { per_page: 100 } }))) || []
  z.certificatePacks = (await safe('zone', `ssl_packs:${zone.name}`, () => cf.getAll(`/zones/${zone.id}/ssl/certificate_packs`, { query: { status: 'all', per_page: 50 } }))) || []

  const customRs = await safe('zone', `waf_custom:${zone.name}`, () => cf.get(`/zones/${zone.id}/rulesets/phases/http_request_firewall_custom/entrypoint`))
  const managedRs = await safe('zone', `waf_managed:${zone.name}`, () => cf.get(`/zones/${zone.id}/rulesets/phases/http_request_firewall_managed/entrypoint`))
  const rateRs = await safe('zone', `ratelimit:${zone.name}`, () => cf.get(`/zones/${zone.id}/rulesets/phases/http_ratelimit/entrypoint`))
  const cacheRs = await safe('zone', `cache_rules:${zone.name}`, () => cf.get(`/zones/${zone.id}/rulesets/phases/http_request_cache_settings/entrypoint`))
  z.waf = {
    custom: customRs?.rules || [],
    managed: managedRs?.rules || [],
    rateLimit: rateRs?.rules || [],
  }
  z.cacheRules = cacheRs?.rules || []

  z.pageRules = (await safe('zone', `pagerules:${zone.name}`, () => cf.get(`/zones/${zone.id}/pagerules`))) || []
  z.workersRoutes = (await safe('zone', `workers_routes:${zone.name}`, () => cf.get(`/zones/${zone.id}/workers/routes`))) || []

  const now = new Date()
  const start = new Date(now.getTime() - DAYS_SECURITY * 864e5).toISOString()
  const sec = await safe('zone', `security_events:${zone.name}`, () =>
    cf.graphql(SECURITY_GQL, { zoneTag: zone.id, start, end: now.toISOString() })
  )
  z.securityEvents = sec?.viewer?.zones?.[0]?.firewallEventsAdaptiveGroups || []

  return z
}

async function main() {
  const runStamp = stamp()
  log.step(`CF Command Center — snapshot ${runStamp}`)
  const cf = makeClient({ mode: 'read' })

  const accountId = await resolveAccountId(cf)
  log.info('account:', accountId)

  const account = await safe('account', 'details', () => cf.get(`/accounts/${accountId}`))
  const members = (await safe('account', 'members', () => cf.getAll(`/accounts/${accountId}/members`, { query: { per_page: 50 } }))) || []
  const roles = (await safe('account', 'roles', () => cf.getAll(`/accounts/${accountId}/roles`, { query: { per_page: 50 } }))) || []
  const subscriptions = (await safe('account', 'subscriptions', () => cf.get(`/accounts/${accountId}/subscriptions`))) || []
  const user = await safe('user', 'details', () => cf.get('/user'))
  const tokens = (await safe('user', 'tokens', () => cf.getAll('/user/tokens', { query: { per_page: 50 } }))) || []

  const resources = {
    workers: (await safe('account', 'workers', () => cf.get(`/accounts/${accountId}/workers/scripts`))) || [],
    kv: (await safe('account', 'kv', () => cf.getAll(`/accounts/${accountId}/storage/kv/namespaces`, { query: { per_page: 100 } }))) || [],
    r2: (await safe('account', 'r2', () => cf.getCursor(`/accounts/${accountId}/r2/buckets`, { query: { per_page: 100 } }))) || [],
    d1: (await safe('account', 'd1', () => cf.getAll(`/accounts/${accountId}/d1/database`, { query: { per_page: 100 } }))) || [],
    queues: (await safe('account', 'queues', () => cf.getAll(`/accounts/${accountId}/queues`, { query: { per_page: 100 } }))) || [],
    pages: (await safe('account', 'pages', () => cf.get(`/accounts/${accountId}/pages/projects`))) || [],
  }

  // Cron triggers per worker (best-effort, small N).
  await safe('account', 'cron', async () => {
    for (const w of resources.workers) {
      const name = w.id || w.name
      const sched = await cf.get(`/accounts/${accountId}/workers/scripts/${name}/schedules`).catch(() => null)
      if (sched?.schedules?.length) w.schedules = sched.schedules
    }
  })

  log.step('zones')
  const zonesRaw = (await safe('zone', 'list', () => cf.getAll('/zones', { query: { 'account.id': accountId, per_page: 50 } }))) || []
  log.info(`${zonesRaw.length} zone(s)`)
  const zones = await mapLimit(zonesRaw, ZONE_CONCURRENCY, (z) => collectZone(cf, z))

  // Audit logs (change attribution) — current v2 endpoint, requires since/before.
  const now = new Date()
  const since = new Date(now.getTime() - DAYS_AUDIT * 864e5).toISOString()
  const auditRaw = (await safe('account', 'audit_logs', () =>
    cf.getCursor(`/accounts/${accountId}/logs/audit`, { query: { since, before: now.toISOString(), limit: 1000 } })
  )) || []
  const auditLog = auditRaw.slice(0, 3000).map((e) => ({
    when: e.when || e.created_at || e.timestamp || null,
    actor: { email: e.actor?.email ?? e.actor_email ?? null, type: e.actor?.type ?? e.actor?.context ?? null, id: e.actor?.id ?? null, ip: e.actor?.ip ?? e.actor_ip ?? null },
    action: typeof e.action === 'object' ? (e.action.type || e.action.result) : e.action,
    resource: typeof e.resource === 'object' ? `${e.resource.type ?? ''}${e.resource.id ? ':' + e.resource.id : ''}` : e.resource,
    interface: e.interface ?? null,
    ray: e.ray_id ?? e.ray ?? null,
  }))

  const counts = {
    zones: zones.length,
    dnsRecords: zones.reduce((n, z) => n + (z.dnsRecords?.length || 0), 0),
    workers: resources.workers.length,
    kv: resources.kv.length,
    r2: resources.r2.length,
    d1: resources.d1.length,
    queues: resources.queues.length,
    pages: resources.pages.length,
    members: members.length,
    tokens: tokens.length,
    auditEntries: auditLog.length,
    errors: errors.length,
  }

  const snapshot = redact({
    schema: 1,
    generatedAt: now.toISOString(),
    stamp: runStamp,
    account: { id: accountId, name: account?.name ?? null, type: account?.type ?? null, settings: account?.settings ?? null },
    user: user ? { id: user.id, email: user.email, two_factor_authentication_enabled: user.two_factor_authentication_enabled } : null,
    subscriptions,
    members,
    roles,
    tokens,
    resources,
    zones,
    auditLog,
    counts,
    errors,
  })

  const dir = snapshotDir(runStamp)
  const file = join(dir, 'snapshot.json')
  writeJson(file, snapshot)

  // snapshot.json (above) is the full-fidelity local copy — gitignored, used by
  // report/diff/betas/dashboard so your local tooling always shows real names.
  // snapshot.public.json is the pseudonymized sibling that actually gets
  // committed: real ids/domains/names/emails/IPs replaced with deterministic
  // aliases, reversible offline via secrets/alias-map.json + CF_ALIAS_SALT.
  const vault = loadVault()
  const { aliased, dirty } = aliasSnapshot(snapshot, vault)
  const publicFile = join(dir, 'snapshot.public.json')
  writeJson(publicFile, aliased)
  if (dirty) saveVault(vault)

  recordSnapshot(runStamp, { generatedAt: snapshot.generatedAt, counts })

  log.ok(`snapshot written → ${file.replace(DIRS.root, '.')} (local, gitignored)`)
  log.ok(`public snapshot written → ${publicFile.replace(DIRS.root, '.')} (safe to commit)`)
  log.info('counts:', JSON.stringify(counts))
  if (errors.length) log.warn(`${errors.length} collector(s) skipped (likely token scope) — see snapshot.errors`)
  log.dim('next: npm run report  &&  npm run build-data')
}

main().catch((e) => {
  log.err(e.message)
  if (process.env.CF_DEBUG) console.error(e.stack)
  process.exit(1)
})
