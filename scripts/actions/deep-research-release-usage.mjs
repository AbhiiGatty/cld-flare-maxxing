#!/usr/bin/env node
/**
 * Guarded action: release a bounded number of Deep Research scan credits
 * that were charged by a confirmed server-side job creation failure.
 *
 * DRY-RUN by default. Add --commit to mutate the account.
 */
import { loadEnv, log } from '../lib/util.mjs'
import { DIRS } from '../lib/paths.mjs'
import { makeClient, resolveAccountId } from '../lib/cf.mjs'
import { audit, bootEdit, parseArgs } from './_lib.mjs'

const { args, commit } = parseArgs(process.argv.slice(2))
const action = 'deep-research-release-usage'
const databaseName = String(args.database || '')
const member = String(args.member || '').trim().toLowerCase()
const count = Number(args.count)

if (
  !/^[a-z0-9-]+$/.test(databaseName)
  || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(member)
  || !Number.isInteger(count)
  || count < 1
  || count > 10
) {
  log.err('usage: --database=<d1-name> --member=<email> --count=<1-10> [--commit]')
  process.exit(1)
}

loadEnv(DIRS.env)
const read = makeClient({ mode: 'read' })
const accountId = await resolveAccountId(read)
const databases = await read.getAll(`/accounts/${accountId}/d1/database`, {
  query: { name: databaseName, per_page: 100 },
})
const database = databases.find((item) => item.name === databaseName)
if (!database?.uuid) throw new Error(`D1 database not found: ${databaseName}`)

async function query(client, sql, params = []) {
  const response = await client.raw(
    'POST',
    `/accounts/${accountId}/d1/database/${database.uuid}/query`,
    { body: { sql, params } },
  )
  const result = response?.result?.[0]
  if (!result?.success) throw new Error('D1 query failed')
  return result
}

const usageSQL = `
SELECT scan_count
  FROM daily_usage
 WHERE member_email = ?
   AND usage_date = date('now')
`
const before = (await query(read, usageSQL, [member])).results?.[0]
if (!before) throw new Error('No scan usage exists for this member today')
if (Number(before.scan_count) < count) {
  throw new Error('Release count exceeds current scan usage')
}

log.info(`D1 database: ${databaseName}`)
log.info(`Member: ${member}`)
log.info(`Today scan usage: ${before.scan_count}`)
log.info(`Confirmed failed-job credits to release: ${count}`)

if (!commit) {
  log.warn('DRY-RUN - nothing changed. Re-run with --commit to release these credits.')
  audit({ action, status: 'DRY_RUN', databaseName, member, count, before: before.scan_count })
} else {
  const edit = bootEdit(action, { database: databaseName, member, count, before: before.scan_count })
  const updated = await query(edit, `
UPDATE daily_usage
   SET scan_count = scan_count - ?,
       updated_at = CURRENT_TIMESTAMP
 WHERE member_email = ?
   AND usage_date = date('now')
   AND scan_count >= ?
 RETURNING scan_count
`, [count, member, count])
  const after = updated.results?.[0]
  const expected = Number(before.scan_count) - count
  if (!after || Number(after.scan_count) !== expected) {
    audit({ action, status: 'FAILED', databaseName, member, count, before, after })
    throw new Error('Scan usage release verification failed')
  }
  audit({ action, status: 'COMMITTED', databaseName, member, count, before, after })
  log.ok(`Released ${count} failed-job scan credits. Today scan usage: ${after.scan_count}.`)
}
