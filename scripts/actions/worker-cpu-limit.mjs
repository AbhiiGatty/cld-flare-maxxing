#!/usr/bin/env node
/**
 * Guarded action: set a per-Worker CPU cap (limits.cpu_ms in script settings).
 *
 * Workers Paid removes the free plan's 10ms wall (default becomes 30s), which
 * also means one buggy or abused Worker can quietly eat the whole 30M ms/month
 * included pool and start billing overage. A per-script cpu_ms cap turns that
 * into an isolated failure of the one Worker instead of a shared bill.
 *
 * Caps are passed explicitly — this script never invents a number, because a
 * cap below a Worker's real P99 breaks it in production.
 *
 * DRY-RUN by default — reads current limits with the READ token, changes
 * nothing, needs no break-glass. Only --commit arms break-glass and mutates.
 *
 * Flags: --set=<worker>:<cpu_ms>[,<worker>:<cpu_ms>...] [--commit]
 *
 *   node scripts/actions/worker-cpu-limit.mjs --set=build-notifier:100,edible-factor-web:1000
 *   CF_ALLOW_DESTRUCTIVE=YES_I_AM_SURE node scripts/actions/worker-cpu-limit.mjs --set=... --commit
 */
import { DIRS } from '../lib/paths.mjs'
import { loadEnv, log } from '../lib/util.mjs'
import { makeClient, resolveAccountId } from '../lib/cf.mjs'
import { bootEdit, parseArgs, audit } from './_lib.mjs'

const { args, commit } = parseArgs(process.argv.slice(2))
const action = 'worker-cpu-limit'

if (!args.set) { log.err('missing --set=<worker>:<cpu_ms>[,...]'); process.exit(1) }
const wanted = []
for (const pair of String(args.set).split(',')) {
  const [name, ms] = pair.split(':').map((s) => s.trim())
  const cpuMs = Number(ms)
  if (!name || !Number.isInteger(cpuMs) || cpuMs < 1) { log.err(`bad --set entry: "${pair}" (want worker:cpu_ms)`); process.exit(1) }
  wanted.push({ name, cpuMs })
}

loadEnv(DIRS.env)
const read = makeClient({ mode: 'read' })
const accountId = await resolveAccountId(read)

const scripts = await read.getAll(`/accounts/${accountId}/workers/scripts`, { query: { per_page: 100 } })
const scriptNames = new Set(scripts.map((s) => s.id))

const plan = []
for (const w of wanted) {
  if (!scriptNames.has(w.name)) { log.err(`worker not found on account: ${w.name}`); process.exit(1) }
  const settings = await read.get(`/accounts/${accountId}/workers/scripts/${w.name}/script-settings`).catch(() => null)
  const current = settings?.limits?.cpu_ms ?? null
  if (current === w.cpuMs) { log.info(`${w.name}: cpu_ms already ${current} — nothing to do`); continue }
  plan.push({ ...w, current })
}

log.info(`worker-cpu-limit — ${plan.length} worker(s) to change`)
for (const p of plan) console.log(`  ${p.name}: cpu_ms ${p.current ?? 'unset (plan default 30s)'} -> ${p.cpuMs}`)
if (!plan.length) { log.ok('nothing to change.'); process.exit(0) }

if (!commit) {
  console.log('')
  log.warn(`DRY-RUN — would set per-script CPU caps on ${plan.length} worker(s). Nothing mutated.`)
  log.warn('A cap below a worker\'s real P99 CPU breaks its slowest requests — check reports before committing.')
  log.warn('Re-run with --commit (and break-glass armed) to apply.')
  audit({ action, status: 'DRY_RUN', changes: plan.map((p) => `${p.name}:${p.cpuMs}`) })
  process.exit(0)
}

const cf = bootEdit(action, { changes: plan.map((p) => `${p.name}:${p.cpuMs}`) })
for (const p of plan) {
  try {
    await cf.raw('PATCH', `/accounts/${accountId}/workers/scripts/${p.name}/script-settings`, {
      body: { limits: { cpu_ms: p.cpuMs } },
    })
    audit({ action, status: 'COMMITTED', worker: p.name, cpu_ms: p.cpuMs, was: p.current })
    log.ok(`${p.name}: cpu_ms ${p.current ?? 'unset'} -> ${p.cpuMs}`)
  } catch (e) {
    audit({ action, status: 'FAILED', worker: p.name, cpu_ms: p.cpuMs, error: e.message })
    log.err(`${p.name}: FAILED — ${e.message}`)
  }
}
log.ok('worker-cpu-limit applied. Run `npm run refresh` to recapture state.')
