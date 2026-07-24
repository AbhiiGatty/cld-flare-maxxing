#!/usr/bin/env node
/**
 * Guarded action: deploy the Cloudflare Managed Ruleset in the zone's
 * http_request_firewall_managed phase (the "sec-managed-waf-disabled" fix).
 *
 * Looks up the account's "Cloudflare Managed Ruleset" id dynamically (never
 * hardcoded) via GET /accounts/{account_id}/rulesets, then deploys it with
 * Cloudflare's own tuned rule actions (no overrides) — the same effect as the
 * dashboard's WAF → Managed Rules → "Deploy" button. Skips zones that already
 * have an entrypoint deployed (rerun shows nothing to change).
 *
 * DRY-RUN by default — reads current state with the READ token, changes nothing,
 * needs no break-glass. Only --commit arms break-glass and mutates.
 *
 * Flags: [--zone=<name|id>] [--commit]
 *
 *   node scripts/actions/waf-managed-deploy.mjs                 # dry-run, all zones
 *   CF_ALLOW_DESTRUCTIVE=YES_I_AM_SURE node scripts/actions/waf-managed-deploy.mjs --commit
 */
import { join } from 'node:path'
import { DIRS } from '../lib/paths.mjs'
import { loadEnv, log } from '../lib/util.mjs'
import { makeClient, resolveAccountId } from '../lib/cf.mjs'
import { bootEdit, parseArgs, audit } from './_lib.mjs'

const { args, commit } = parseArgs(process.argv.slice(2))
const action = 'waf-managed-deploy'

loadEnv(DIRS.env)
const read = makeClient({ mode: 'read' })

const accountId = await resolveAccountId(read)
const accountRulesets = await read.getAll(`/accounts/${accountId}/rulesets`, { query: { per_page: 50 } })
const managed = accountRulesets.find((r) => r.kind === 'managed' && /^Cloudflare Managed( Free)? Ruleset$/i.test(r.name))
if (!managed) { log.err('could not find the "Cloudflare Managed Ruleset" in this account\'s ruleset list — check Account WAF Read scope.'); process.exit(1) }
log.info(`managed ruleset: ${managed.name} (${managed.id})`)

let zones = await read.getAll('/zones', { query: { per_page: 50 } })
if (args.zone) zones = zones.filter((z) => z.name === args.zone || z.id === args.zone)
if (!zones.length) { log.err('no matching zones'); process.exit(1) }

const plan = []
for (const z of zones) {
  const entry = await read.raw('GET', `/zones/${z.id}/rulesets/phases/http_request_firewall_managed/entrypoint`).catch((e) => {
    if (e.status === 404) return null
    throw e
  })
  const rules = entry?.result?.rules || []
  const alreadyDeployed = rules.some((r) => r.action === 'execute' && r.action_parameters?.id === managed.id)
  if (!alreadyDeployed) plan.push({ zone: z })
}

log.info(`waf-managed-deploy — ${plan.length} zone(s) need the Managed Ruleset deployed`)
for (const p of plan) console.log(`  ${p.zone.name}`)
if (!plan.length) { log.ok('nothing to change — Cloudflare Managed Ruleset already deployed everywhere.'); process.exit(0) }

if (!commit) {
  console.log('')
  log.warn(`DRY-RUN — would deploy "${managed.name}" (execute, Cloudflare-tuned actions, no overrides) on ${plan.length} zone(s). Nothing mutated.`)
  log.warn('Re-run with --commit (and break-glass armed) to apply.')
  audit({ action, status: 'DRY_RUN', rulesetId: managed.id, zones: plan.map((p) => p.zone.name) })
  process.exit(0)
}

const cf = bootEdit(action, { rulesetId: managed.id, zones: plan.map((p) => p.zone.name) })
for (const p of plan) {
  try {
    await cf.raw('PUT', `/zones/${p.zone.id}/rulesets/phases/http_request_firewall_managed/entrypoint`, {
      body: { rules: [{ action: 'execute', expression: 'true', description: 'Cloudflare Managed Ruleset', action_parameters: { id: managed.id } }] },
    })
    audit({ action, status: 'COMMITTED', zone: p.zone.name, rulesetId: managed.id })
    log.ok(`${p.zone.name}: Cloudflare Managed Ruleset deployed`)
  } catch (e) {
    audit({ action, status: 'FAILED', zone: p.zone.name, rulesetId: managed.id, error: e.message })
    log.err(`${p.zone.name}: FAILED — ${e.message}`)
  }
}
log.ok('managed WAF deploy applied. Run `npm run refresh` to recapture state.')
