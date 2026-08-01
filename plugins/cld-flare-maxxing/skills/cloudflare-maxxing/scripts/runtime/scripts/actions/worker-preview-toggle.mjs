#!/usr/bin/env node
/**
 * Guarded action: disable (or enable) Workers preview URLs per script
 * (subdomain.previews_enabled). Preview URLs are the
 * <version>-<script>.<subdomain>.workers.dev links minted for uploaded
 * versions; they stay reachable without any route/domain config.
 *
 * Deliberately does NOT touch subdomain.enabled - that's the script's
 * PRODUCTION workers.dev hostname, which may serve real traffic.
 *
 * DRY-RUN by default. --commit to apply. Requires break-glass.
 *
 * Flags: --workers=<name>[,<name>...] [--enable] [--commit]
 *
 *   node scripts/actions/worker-preview-toggle.mjs --workers=a,b        # dry-run, disable
 *   CF_ALLOW_DESTRUCTIVE=YES_I_AM_SURE node scripts/actions/worker-preview-toggle.mjs --workers=a,b --commit
 */
import { bootEdit, bootRead, parseArgs, log, audit } from './_lib.mjs'
import { resolveAccountId } from '../lib/cf.mjs'

const { args, commit } = parseArgs(process.argv.slice(2))
const action = 'worker-preview-toggle'
const target = args.enable === true
if (!args.workers) { log.err('missing --workers=<name>[,<name>...]'); process.exit(1) }
const names = String(args.workers).split(',').map((s) => s.trim()).filter(Boolean)

const read = bootRead()
const accountId = await resolveAccountId(read)

const plan = []
for (const name of names) {
  const sub = await read.get(`/accounts/${accountId}/workers/scripts/${name}/subdomain`).catch((e) => {
    log.err(`${name}: cannot read subdomain settings — ${e.message}`); process.exit(1)
  })
  if (sub?.previews_enabled === target) { log.info(`${name}: previews_enabled already ${target} — nothing to do`); continue }
  plan.push({ name, enabled: sub?.enabled ?? false, from: sub?.previews_enabled })
}

log.info(`worker-preview-toggle — ${plan.length} worker(s): previews_enabled -> ${target}`)
for (const p of plan) console.log(`  ${p.name}: previews_enabled ${p.from} -> ${target} (workers.dev production stays ${p.enabled})`)
if (!plan.length) { log.ok('nothing to change.'); process.exit(0) }

if (!commit) {
  console.log('')
  log.warn('DRY-RUN — nothing changed. Re-run with --commit (and break-glass armed) to apply.')
  audit({ action, status: 'DRY_RUN', target, workers: plan.map((p) => p.name) })
  process.exit(0)
}

const cf = bootEdit(action, { target, workers: plan.map((p) => p.name) })
for (const p of plan) {
  try {
    // POST replaces the subdomain config; enabled is echoed back unchanged so
    // only the previews flag moves.
    await cf.raw('POST', `/accounts/${accountId}/workers/scripts/${p.name}/subdomain`, {
      body: { enabled: p.enabled, previews_enabled: target },
    })
    audit({ action, status: 'COMMITTED', worker: p.name, previews_enabled: target })
    log.ok(`${p.name}: previews_enabled -> ${target}`)
  } catch (e) {
    audit({ action, status: 'FAILED', worker: p.name, error: e.message })
    log.err(`${p.name}: FAILED — ${e.message}`)
  }
}
log.ok('worker-preview-toggle applied. Run `npm run refresh` to recapture state.')
