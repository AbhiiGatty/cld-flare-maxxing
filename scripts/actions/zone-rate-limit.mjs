#!/usr/bin/env node
/**
 * Guarded action: deploy a baseline per-IP rate limiting rule on each zone.
 *
 * Free zone plans include exactly one rate limiting rule (http_ratelimit
 * phase, fixed 10s period / 10s mitigation). This deploys a deliberately
 * generous per-IP ceiling — it exists to stop scripted abuse and spam bursts
 * from running up Workers-request overage, not to throttle real visitors.
 * At 300 requests / 10s (30 rps sustained from a single IP), a human browser
 * never touches it.
 *
 * Skips zones that already have any http_ratelimit rules (the free plan's
 * single slot is taken — replacing someone's tuned rule is not this script's
 * call).
 *
 * DRY-RUN by default — reads current state with the READ token, changes
 * nothing, needs no break-glass. Only --commit arms break-glass and mutates.
 *
 * Flags: [--zone=<name|id>] [--rps=<requests_per_10s>] [--commit]
 *
 *   node scripts/actions/zone-rate-limit.mjs                 # dry-run, all zones
 *   CF_ALLOW_DESTRUCTIVE=YES_I_AM_SURE node scripts/actions/zone-rate-limit.mjs --commit
 */
import { DIRS } from '../lib/paths.mjs'
import { loadEnv, log } from '../lib/util.mjs'
import { makeClient } from '../lib/cf.mjs'
import { bootEdit, parseArgs, audit } from './_lib.mjs'

const { args, commit } = parseArgs(process.argv.slice(2))
const action = 'zone-rate-limit'
const requestsPer10s = Number(args.rps || 300)
if (!Number.isInteger(requestsPer10s) || requestsPer10s < 10) { log.err('bad --rps (min 10)'); process.exit(1) }

loadEnv(DIRS.env)
const read = makeClient({ mode: 'read' })

let zones = await read.getAll('/zones', { query: { per_page: 50 } })
if (args.zone) zones = zones.filter((z) => z.name === args.zone || z.id === args.zone)
if (!zones.length) { log.err('no matching zones'); process.exit(1) }

const plan = []
for (const z of zones) {
  const entry = await read.raw('GET', `/zones/${z.id}/rulesets/phases/http_ratelimit/entrypoint`).catch((e) => {
    if (e.status === 404) return null
    throw e
  })
  const rules = entry?.result?.rules || []
  if (rules.length) { log.info(`${z.name}: already has ${rules.length} rate limiting rule(s) — skipping (free slot taken)`); continue }
  plan.push({ zone: z })
}

log.info(`zone-rate-limit — ${plan.length} zone(s) need the baseline rule (${requestsPer10s} req / 10s per IP, block 10s)`)
for (const p of plan) console.log(`  ${p.zone.name}`)
if (!plan.length) { log.ok('nothing to change.'); process.exit(0) }

if (!commit) {
  console.log('')
  log.warn(`DRY-RUN — would deploy the baseline per-IP rate limit on ${plan.length} zone(s). Nothing mutated.`)
  log.warn('Re-run with --commit (and break-glass armed) to apply.')
  audit({ action, status: 'DRY_RUN', rps10s: requestsPer10s, zones: plan.map((p) => p.zone.name) })
  process.exit(0)
}

const cf = bootEdit(action, { rps10s: requestsPer10s, zones: plan.map((p) => p.zone.name) })
for (const p of plan) {
  try {
    await cf.raw('PUT', `/zones/${p.zone.id}/rulesets/phases/http_ratelimit/entrypoint`, {
      body: {
        rules: [{
          action: 'block',
          expression: 'true',
          description: `Baseline anti-abuse limit: ${requestsPer10s} req/10s per IP`,
          ratelimit: {
            characteristics: ['ip.src', 'cf.colo.id'],
            period: 10,
            requests_per_period: requestsPer10s,
            mitigation_timeout: 10,
          },
        }],
      },
    })
    audit({ action, status: 'COMMITTED', zone: p.zone.name, rps10s: requestsPer10s })
    log.ok(`${p.zone.name}: baseline rate limit deployed`)
  } catch (e) {
    audit({ action, status: 'FAILED', zone: p.zone.name, error: e.message })
    log.err(`${p.zone.name}: FAILED — ${e.message}`)
  }
}
log.ok('zone-rate-limit applied. Run `npm run refresh` to recapture state.')
