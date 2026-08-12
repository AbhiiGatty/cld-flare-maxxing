#!/usr/bin/env node
/**
 * Guarded action: edit the email include list of an Access application's
 * allow policy.
 *
 * Why this exists: Access one-time PIN only sends a code when the login
 * email matches an allow policy include on THAT app - and the login page
 * says "check your email" either way (anti-enumeration). So an email
 * missing from the policy looks like "OTP not delivered" to the user.
 * Adding someone to an app always means adding them here.
 *
 * Modes (exactly one):
 *   --add=<email>[,<email>...]     append to the existing email includes
 *   --set-emails=<email>[,...]     REPLACE the whole include list with these
 *                                  emails (turns an `everyone` policy into a
 *                                  named allowlist)
 *
 * DRY-RUN by default. --commit to apply. Requires break-glass.
 *
 * Flags: --app=<name|domain|id> (--add=... | --set-emails=...) [--commit]
 */
import { bootEdit, bootRead, parseArgs, log, audit } from './_lib.mjs'
import { resolveAccountId } from '../lib/cf.mjs'

const { args, commit } = parseArgs(process.argv.slice(2))
const action = 'access-policy-email'

if (!args.app) { log.err('missing --app=<name|domain|id>'); process.exit(1) }
if (!args.add === !args['set-emails']) { log.err('pass exactly one of --add=... or --set-emails=...'); process.exit(1) }
const parseEmails = (s) => String(s).split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
const adding = args.add ? parseEmails(args.add) : null
const setting = args['set-emails'] ? parseEmails(args['set-emails']) : null
for (const e of adding || setting) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { log.err(`not an email: ${e}`); process.exit(1) }
}

const read = bootRead()
const accountId = await resolveAccountId(read)

const apps = await read.getAll(`/accounts/${accountId}/access/apps`, { query: { per_page: 50 } })
const matches = apps.filter((a) => a.id === args.app || a.name === args.app || (a.domain || '').startsWith(args.app))
if (matches.length !== 1) {
  log.err(`--app matched ${matches.length} apps (need exactly 1):`)
  for (const a of matches.length ? matches : apps) console.log(`  ${a.name} | ${a.domain}`)
  process.exit(1)
}
const app = matches[0]

const policies = await read.get(`/accounts/${accountId}/access/apps/${app.id}/policies`)
const allows = (policies || []).filter((p) => p.decision === 'allow')
if (allows.length !== 1) { log.err(`app has ${allows.length} allow policies - this script only handles exactly one`); process.exit(1) }
const pol = allows[0]

const currentEmails = (pol.include || []).filter((i) => i.email?.email).map((i) => i.email.email.toLowerCase())
const nonEmailIncludes = (pol.include || []).filter((i) => !i.email?.email)

let nextEmails, dropNonEmail = false
if (adding) {
  nextEmails = [...new Set([...currentEmails, ...adding])]
} else {
  nextEmails = [...new Set(setting)]
  dropNonEmail = true // --set-emails replaces everything, including `everyone`
}
const nextInclude = [
  ...(dropNonEmail ? [] : nonEmailIncludes),
  ...nextEmails.map((e) => ({ email: { email: e } })),
]

log.info(`app: ${app.name} (${app.domain})`)
log.info(`policy: "${pol.name}" (${pol.id})`)
log.info(`include now: ${JSON.stringify(pol.include)}`)
log.info(`include next: ${JSON.stringify(nextInclude)}`)
const unchanged = JSON.stringify(pol.include) === JSON.stringify(nextInclude)
if (unchanged) { log.ok('nothing to change.'); process.exit(0) }

if (!commit) {
  console.log('')
  log.warn('DRY-RUN — nothing changed. Re-run with --commit (and break-glass armed) to apply.')
  audit({ action, status: 'DRY_RUN', app: app.name, policy: pol.name, emails: nextEmails })
  process.exit(0)
}

const cf = bootEdit(action, { app: app.name, policy: pol.name, emails: nextEmails })
await cf.raw('PUT', `/accounts/${accountId}/access/apps/${app.id}/policies/${pol.id}`, {
  body: { ...pol, include: nextInclude },
})
audit({ action, status: 'COMMITTED', app: app.name, policy: pol.name, emails: nextEmails })
log.ok(`"${pol.name}" on ${app.name}: include updated (${nextEmails.length} email(s)).`)
