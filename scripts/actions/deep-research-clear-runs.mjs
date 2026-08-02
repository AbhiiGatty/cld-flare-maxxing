#!/usr/bin/env node
/**
 * Guarded action: permanently remove every Deep Research job and its
 * foreign-key-cascaded normalized results from one D1 database.
 *
 * Members, provider credentials, API tokens, daily usage, and audit events are
 * preserved. DRY-RUN by default. Add --commit to mutate the account.
 */
import { loadEnv, log } from '../lib/util.mjs'
import { DIRS } from '../lib/paths.mjs'
import { makeClient, resolveAccountId } from '../lib/cf.mjs'
import { audit, bootEdit, parseArgs } from './_lib.mjs'

const { args, commit } = parseArgs(process.argv.slice(2))
const action = 'deep-research-clear-runs'
const databaseName = String(args.database || '')

if (!/^[a-z0-9-]+$/.test(databaseName)) {
  log.err('usage: --database=<d1-name> [--commit]')
  process.exit(1)
}

loadEnv(DIRS.env)
const read = makeClient({ mode: 'read' })
const accountId = await resolveAccountId(read)
const databases = await read.getAll(`/accounts/${accountId}/d1/database`, {
  query: { name: databaseName, per_page: 100 },
})
const database = databases.find((item) => item.name === databaseName)
if (!database?.uuid) {
  throw new Error(`D1 database not found: ${databaseName}`)
}

async function query(client, sql) {
  const response = await client.raw(
    'POST',
    `/accounts/${accountId}/d1/database/${database.uuid}/query`,
    { body: { sql } },
  )
  const result = response?.result?.[0]
  if (!result?.success) throw new Error('D1 query failed')
  return result
}

const countSQL = `
SELECT
  (SELECT COUNT(*) FROM research_jobs) AS jobs,
  (SELECT COUNT(*) FROM research_jobs WHERE status IN ('queued', 'submitted', 'running')) AS active_jobs,
  (SELECT COUNT(*) FROM company_profiles) AS profiles,
  (SELECT COUNT(*) FROM company_people) AS people,
  (SELECT COUNT(*) FROM contacts) AS contacts,
  (SELECT COUNT(*) FROM contact_sources) AS contact_sources,
  (SELECT COUNT(*) FROM research_observations) AS observations,
  (SELECT COUNT(*) FROM ai_briefs) AS briefs
`

const before = (await query(read, countSQL)).results?.[0]
if (!before) throw new Error('D1 run count query returned no row')

log.info(`D1 database: ${databaseName}`)
log.info(`Research jobs: ${before.jobs}`)
log.info(`Active jobs: ${before.active_jobs}`)
log.info(
  `Cascaded rows: ${before.profiles} profiles, ${before.people} people, `
    + `${before.contacts} contacts, ${before.contact_sources} contact sources, `
    + `${before.observations} observations, ${before.briefs} briefs`,
)
log.info('Preserved: members, provider credentials, API tokens, daily usage, and audit events')

if (!commit) {
  log.warn('DRY-RUN - nothing changed. Re-run with --commit to clear these runs.')
  audit({ action, status: 'DRY_RUN', databaseName, counts: before })
} else {
  if (Number(before.active_jobs) > 0) {
    audit({ action, status: 'REFUSED', databaseName, reason: 'active jobs exist', counts: before })
    throw new Error('Active research jobs exist. Cancel them before clearing saved runs.')
  }

  const edit = bootEdit(action, { database: databaseName, counts: before })
  await query(edit, 'DELETE FROM research_jobs')
  const after = (await query(edit, countSQL)).results?.[0]
  if (!after || Object.values(after).some((value) => Number(value) !== 0)) {
    audit({ action, status: 'FAILED', databaseName, before, after })
    throw new Error('D1 clear verification failed')
  }

  audit({ action, status: 'COMMITTED', databaseName, before, after })
  log.ok('Deep Research jobs and cascaded normalized results cleared and verified.')
}
