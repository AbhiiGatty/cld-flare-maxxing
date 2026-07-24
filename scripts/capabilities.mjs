#!/usr/bin/env node
/**
 * Probe what the READ and EDIT tokens can actually do, write a local config the
 * agent consults before any change: config/token-capabilities.json.
 *
 * READ: real GET probe per service (definitive).
 * EDIT: derived from token permission groups when read-only introspection is
 *   allowed. Otherwise reported as unknown. This script never sends a
 *   mutation-shaped request.
 *
 * Usage: node scripts/capabilities.mjs
 */
import { join } from 'node:path'
import { DIRS } from './lib/paths.mjs'
import { loadEnv, writeJson, log } from './lib/util.mjs'
import { makeClient } from './lib/cf.mjs'

loadEnv(join(DIRS.root, '.env'))
loadEnv(join(DIRS.root, '.env.break-glass'))
const acct = process.env.CF_ACCOUNT_ID

let zid = null, zname = null
for (const mode of ['read', 'edit']) {
  const tok = mode === 'edit' ? process.env.CF_EDIT_TOKEN : (process.env.CF_READ_TOKEN || process.env.CF_API_TOKEN)
  if (!tok) continue
  try { const z = await makeClient({ mode }).getAll('/zones', { query: { per_page: 1 } }); if (z[0]) { zid = z[0].id; zname = z[0].name; break } } catch { /**/ }
}
const fill = (p) => p.replace('{z}', zid).replace('{a}', acct)

// read = GET path; write = permission-group regex.
const SERVICES = [
  { key: 'dns',            label: 'DNS records',        cat: 'zone',    read: '/zones/{z}/dns_records',          write: /dns/i },
  { key: 'dnssec',         label: 'DNSSEC',             cat: 'zone',    read: '/zones/{z}/dnssec',               write: /dns/i },
  { key: 'zone_settings',  label: 'Zone settings/SSL mode', cat: 'zone', read: '/zones/{z}/settings',            write: /zone settings/i },
  { key: 'ssl',            label: 'SSL & certificates', cat: 'zone',    read: '/zones/{z}/ssl/certificate_packs', write: /ssl|certificat/i },
  { key: 'waf',            label: 'WAF / firewall',     cat: 'zone',    read: '/zones/{z}/rulesets/phases/http_request_firewall_custom/entrypoint', write: /waf|firewall/i },
  { key: 'ratelimit',      label: 'Rate limiting',      cat: 'zone',    read: '/zones/{z}/rulesets/phases/http_ratelimit/entrypoint',               write: /waf|firewall|rate/i },
  { key: 'cache',          label: 'Cache rules',        cat: 'zone',    read: '/zones/{z}/rulesets/phases/http_request_cache_settings/entrypoint',  write: /cache/i },
  { key: 'pagerules',      label: 'Page rules',         cat: 'zone',    read: '/zones/{z}/pagerules',            write: /page rules/i },
  { key: 'workers_routes', label: 'Workers routes',     cat: 'zone',    read: '/zones/{z}/workers/routes',       write: /workers routes/i },
  { key: 'email_routing',  label: 'Email routing',      cat: 'zone',    read: '/zones/{z}/email/routing',        write: /email/i },
  { key: 'workers',        label: 'Workers scripts',    cat: 'account', read: '/accounts/{a}/workers/scripts',   write: /workers scripts/i },
  { key: 'kv',             label: 'Workers KV',         cat: 'account', read: '/accounts/{a}/storage/kv/namespaces', write: /kv/i },
  { key: 'r2',             label: 'R2 storage',         cat: 'account', read: '/accounts/{a}/r2/buckets',        write: /r2/i },
  { key: 'd1',             label: 'D1 databases',       cat: 'account', read: '/accounts/{a}/d1/database',       write: /\bd1\b/i },
  { key: 'queues',         label: 'Queues',             cat: 'account', read: '/accounts/{a}/queues',            write: /queue/i },
  { key: 'turnstile',      label: 'Turnstile',          cat: 'account', read: '/accounts/{a}/challenges/widgets', write: /turnstile/i },
  { key: 'account_rulesets', label: 'Account rulesets', cat: 'account', read: '/accounts/{a}/rulesets',          write: /account rulesets|account waf/i },
  { key: 'members',        label: 'Members / roles',    cat: 'account', read: '/accounts/{a}/members',           write: /member/i },
  { key: 'tokens',         label: 'API tokens',         cat: 'user',    read: '/user/tokens',                    write: /api tokens/i },
]
const WRITE = /write|edit|admin|manage|send/i

async function probeToken(mode) {
  const tok = mode === 'edit' ? process.env.CF_EDIT_TOKEN : (process.env.CF_READ_TOKEN || process.env.CF_API_TOKEN)
  if (!tok) return { present: false }
  const cli = makeClient({ mode })

  let id = null, status = null
  try { const v = await cli.raw('GET', '/user/tokens/verify'); id = v?.result?.id; status = v?.result?.status } catch (e) { status = 'verify:' + (e.status || e.message) }

  let groups = null, introspect = 'none'
  if (id) for (const path of [`/user/tokens/${id}`, `/accounts/${acct}/tokens/${id}`]) {
    try { const t = await cli.raw('GET', path); const names = []; for (const pol of t?.result?.policies || []) for (const g of pol.permission_groups || []) if (g?.name) names.push(g.name); if (names.length) { groups = [...new Set(names)]; introspect = path.includes('/user/') ? 'user' : 'account'; break } } catch { /**/ }
  }

  const services = {}
  for (const s of SERVICES) {
    // read
    let read = 'unknown'
    if (s.cat === 'zone' && !zid) read = 'no-zone'
    else { try { await cli.raw('GET', fill(s.read)); read = true } catch (e) { read = e.status === 404 ? 'none-configured' : (e.status || 'err') } }
    // edit
    let edit = 'unknown', editVia = null
    if (groups) { edit = groups.some((g) => s.write.test(g) && WRITE.test(g)); editVia = 'groups' }
    services[s.key] = { label: s.label, category: s.cat, read, edit, editVia }
  }

  return { present: true, status, tokenId: id, introspect, permissionGroups: groups, services }
}

const result = {
  probedAt: new Date().toISOString(),
  account: acct,
  probeZone: zname ? { id: zid, name: zname } : null,
  legend: {
    read: 'true=readable · 403/9109=no scope · none-configured=404 (nothing set) · no-zone=no zone visible',
    edit: 'true=write allowed · false=no write permission · unknown=permission groups could not be read · editVia: groups',
    note: 'Capability discovery uses GET requests only. It never tests write access by sending a mutation-shaped request.',
  },
  tokens: { read: await probeToken('read'), edit: await probeToken('edit') },
}

writeJson(join(DIRS.root, 'config', 'token-capabilities.json'), result)
log.ok('token capabilities → config/token-capabilities.json')

const pad = (s, n) => String(s).padEnd(n)
console.log('\n' + pad('service', 18) + pad('READ(edit)', 18) + 'EDIT-token read(edit)')
console.log('-'.repeat(58))
for (const s of SERVICES) {
  const r = result.tokens.read?.services?.[s.key] || {}, e = result.tokens.edit?.services?.[s.key] || {}
  console.log(pad(s.key, 18) + pad(`${r.read}(${r.edit})`, 18) + `${e.read}(${e.edit})`)
}
console.log('\nintrospect — read:', result.tokens.read?.introspect, '| edit:', result.tokens.edit?.introspect)
