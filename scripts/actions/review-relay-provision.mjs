#!/usr/bin/env node
/**
 * Guarded action: provision the Review Relay D1 database.
 *
 * The Turnstile widget is intentionally created by review-relay-deploy.mjs so
 * its returned secret can be installed directly on the Worker without ever
 * being printed or written to disk.
 *
 * DRY-RUN by default. Add --commit to mutate the account.
 */
import { makeClient, resolveAccountId } from '../lib/cf.mjs'
import { DIRS } from '../lib/paths.mjs'
import { loadEnv } from '../lib/util.mjs'
import { bootEdit, parseArgs, log, audit } from './_lib.mjs'

const { args, commit } = parseArgs(process.argv.slice(2))
const action = 'review-relay-provision'
const databaseName = String(args.database || '')

if (!databaseName || !/^[a-z0-9-]+$/.test(databaseName)) {
  log.err('usage: --database=<d1-name> [--commit]')
  process.exit(1)
}

loadEnv(DIRS.env)
const read = makeClient({ mode: 'read' })
const accountId = await resolveAccountId(read)

async function findDatabase(client) {
  const databases = await client.getAll(`/accounts/${accountId}/d1/database`, {
    query: { per_page: 100 },
  })
  return databases.find((item) => item.name === databaseName) || null
}

const before = await findDatabase(read)
log.info(`D1 database: ${databaseName} ${before ? '(exists)' : '(create)'}`)
log.info('Turnstile, Worker deployment, migrations, and secrets are a separate guarded step.')

if (!commit) {
  log.warn('DRY-RUN - nothing changed. Re-run with --commit to apply.')
  audit({
    action,
    status: 'DRY_RUN',
    databaseName,
    databaseExists: Boolean(before),
  })
  process.exit(0)
}

const cf = bootEdit(action, { databaseName })
let database = before

if (!database) {
  const response = await cf.raw('POST', `/accounts/${accountId}/d1/database`, {
    body: {
      name: databaseName,
      primary_location_hint: 'apac',
      read_replication: { mode: 'disabled' },
    },
  })
  database = response.result
  audit({
    action,
    status: 'COMMITTED',
    step: 'create-d1',
    databaseName,
    databaseId: database?.uuid,
  })
  log.ok(`created D1 database ${databaseName}`)
}

const verified = await findDatabase(cf)
if (!verified?.uuid) {
  audit({ action, status: 'FAILED', step: 'verify', databaseName })
  throw new Error('D1 provisioning verification failed.')
}

audit({
  action,
  status: 'COMMITTED',
  step: 'verified',
  databaseName,
  databaseId: verified.uuid,
})
log.ok('Review Relay D1 database provisioned and verified.')
console.log(JSON.stringify({
  databaseName,
  databaseId: verified.uuid,
}, null, 2))
