#!/usr/bin/env node
/**
 * Guarded action: create the account's usage/attack notification policies.
 *   - billing_usage_alert  → fires when a pay-as-you-go product's usage crosses
 *                            a threshold (the "am I about to pay overage" alarm)
 *   - dos_attack_l7        → HTTP DDoS attack detected on any zone
 *
 * Cloudflare enables NO usage notifications by default, even after a plan
 * upgrade — without these, quota exhaustion and traffic abuse are silent.
 * Policy shape is validated against GET /alerting/v3/available_alerts at run
 * time rather than hardcoded, since filter schemas differ per alert type.
 *
 * DRY-RUN by default — reads current policies with the READ token, changes
 * nothing, needs no break-glass. Only --commit arms break-glass and mutates.
 *
 * Flags: [--email=<address>] [--commit]
 *   --email defaults to the account's primary email from GET /user.
 *
 *   node scripts/actions/alerting-setup.mjs                 # dry-run
 *   CF_ALLOW_DESTRUCTIVE=YES_I_AM_SURE node scripts/actions/alerting-setup.mjs --commit
 */
import { DIRS } from '../lib/paths.mjs'
import { loadEnv, log } from '../lib/util.mjs'
import { makeClient, resolveAccountId } from '../lib/cf.mjs'
import { bootEdit, parseArgs, audit } from './_lib.mjs'

const { args, commit } = parseArgs(process.argv.slice(2))
const action = 'alerting-setup'

loadEnv(DIRS.env)
const read = makeClient({ mode: 'read' })
const accountId = await resolveAccountId(read)

// GET /user needs user-scoped auth; account-scoped API tokens get a 403, so
// it's only a best-effort default and --email is the reliable path.
const email = args.email || (await read.get('/user').catch(() => null))?.email
if (!email) { log.err('pass --email=<address> (account-scoped tokens cannot read /user for a default)'); process.exit(1) }

const available = await read.get(`/accounts/${accountId}/alerting/v3/available_alerts`).catch((e) => {
  log.err(`cannot list available alerts — ${e.message} (token needs Notifications Read)`)
  process.exit(1)
})
const availableTypes = new Set(Object.values(available || {}).flat().map((a) => a.type))

const existing = await read.get(`/accounts/${accountId}/alerting/v3/policies`).catch(() => [])
const has = (type) => (existing || []).some((p) => p.alert_type === type && p.enabled !== false)

// Desired policies. billing_usage_alert filters are minimal on purpose: no
// product filter means it applies to every pay-as-you-go product on the
// account, which is exactly the "anything starts costing money" alarm.
// billing_usage_alert requires product + limit filters (Error 17103 without
// them). --product / --limit override the defaults: Workers requests at 8M of
// the 10M/month included, i.e. an 80% early warning.
const WANTED = [
  {
    alert_type: 'billing_usage_alert',
    name: 'Usage crossed threshold (cld-flare-maxxing)',
    description: 'A pay-as-you-go product is consuming toward overage.',
    filters: { product: [String(args.product || 'worker_requests')], limit: [String(args.limit || '8000000')] },
  },
  {
    alert_type: 'dos_attack_l7',
    name: 'HTTP DDoS attack detected (cld-flare-maxxing)',
    description: 'Cloudflare is mitigating an HTTP DDoS attack on a zone.',
    filters: {},
  },
]

const plan = []
for (const w of WANTED) {
  if (!availableTypes.has(w.alert_type)) { log.warn(`${w.alert_type}: not available on this account/plan — skipping`); continue }
  if (has(w.alert_type)) { log.info(`${w.alert_type}: policy already exists and is enabled — nothing to do`); continue }
  plan.push(w)
}

log.info(`alerting-setup — ${plan.length} policy/policies to create, delivery to ${email}`)
for (const p of plan) console.log(`  ${p.alert_type}  "${p.name}"`)
if (!plan.length) { log.ok('nothing to change.'); process.exit(0) }

if (!commit) {
  console.log('')
  log.warn(`DRY-RUN — would create ${plan.length} notification policy/policies (email mechanism only). Nothing mutated.`)
  log.warn('Re-run with --commit (and break-glass armed) to apply.')
  audit({ action, status: 'DRY_RUN', policies: plan.map((p) => p.alert_type), email })
  process.exit(0)
}

const cf = bootEdit(action, { policies: plan.map((p) => p.alert_type), email })
for (const p of plan) {
  try {
    await cf.raw('POST', `/accounts/${accountId}/alerting/v3/policies`, {
      body: {
        name: p.name,
        description: p.description,
        alert_type: p.alert_type,
        enabled: true,
        mechanisms: { email: [{ id: email }] },
        filters: p.filters,
      },
    })
    audit({ action, status: 'COMMITTED', alert_type: p.alert_type, email })
    log.ok(`${p.alert_type}: policy created`)
  } catch (e) {
    audit({ action, status: 'FAILED', alert_type: p.alert_type, error: e.message })
    log.err(`${p.alert_type}: FAILED — ${e.message}`)
  }
}
log.ok('alerting-setup applied.')
