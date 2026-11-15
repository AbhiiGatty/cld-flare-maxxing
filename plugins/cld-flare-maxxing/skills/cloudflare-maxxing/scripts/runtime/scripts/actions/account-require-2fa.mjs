#!/usr/bin/env node
// Enable account membership 2FA only after every accepted member has enrolled.
// Dry-run by default. This action cannot disable the requirement.
import { bootRead, bootEdit, parseArgs, audit, log } from './_lib.mjs'

const { args, commit } = parseArgs(process.argv.slice(2))
const accountId = String(args.account || '')
if (!/^[a-f0-9]{32}$/.test(accountId)) throw new Error('An explicit --account=<id> is required.')
const action = 'account-require-2fa'
const read = bootRead()
const path = `/accounts/${accountId}`

async function inspect(client) {
  const account = await client.get(path)
  if (account?.id !== accountId) throw new Error('Account identity mismatch.')
  const members = await client.getAll(`${path}/members`, { query: { per_page: 50 } })
  const accepted = members.filter(member => member.status === 'accepted')
  if (!accepted.length || accepted.some(member => member.user?.two_factor_authentication_enabled !== true)) {
    throw new Error('Every accepted member must already have verified 2FA enrollment.')
  }
  return { account, memberCount: accepted.length }
}

const before = await inspect(read)
log.info(`${accountId}: require 2FA; ${before.memberCount} accepted member(s) already enrolled.`)
if (before.account.settings?.enforce_twofactor === true) {
  log.ok('Account already requires 2FA. Nothing changed.')
} else if (!commit) {
  audit({ action, status: 'DRY_RUN', accountId, memberCount: before.memberCount })
  log.info('DRY-RUN: enforce_twofactor false -> true. No change made.')
} else {
  const edit = bootEdit(action, { accountId, enforce_twofactor: true })
  try {
    const current = await inspect(edit)
    const settings = { enforce_twofactor: true }
    if (current.account.settings?.abuse_contact_email != null) {
      settings.abuse_contact_email = current.account.settings.abuse_contact_email
    }
    await edit.raw('PUT', path, {
      body: { settings },
    })
    const after = await read.get(path)
    if (after.settings?.enforce_twofactor !== true) throw new Error('2FA requirement did not verify.')
    audit({ action, status: 'COMMITTED', accountId, enforce_twofactor: true })
    log.ok('Verified: account membership now requires 2FA.')
  } catch (error) {
    audit({ action, status: 'FAILED', accountId, error: error.message })
    throw error
  }
}
