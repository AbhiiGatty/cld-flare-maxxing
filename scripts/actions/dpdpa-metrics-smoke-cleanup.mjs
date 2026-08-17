#!/usr/bin/env node
/**
 * Guarded action: verify and remove one fixed synthetic DPDPA Metrics contact.
 *
 * The D1 database, project, event type, and synthetic email are fixed. DRY-RUN
 * is the default. Add --commit only after the printed row is approved.
 */
import { resolveAccountId } from '../lib/cf.mjs'
import { audit, bootEdit, bootRead, log, parseArgs } from './_lib.mjs'

const action = 'dpdpa-metrics-smoke-cleanup'
const DATABASE_NAME = 'gattyworks-metrics'
const PROJECT_ID = 'dpdpa-skill'
const EVENT_TYPE = 'email'
const SYNTHETIC_EMAIL = 'dpdpa-smoke-1786789394070@example.com'

function fail(message) {
  log.err(message)
  process.exit(1)
}

function safeRow(row) {
  return {
    id: Number(row.id),
    project_id: String(row.project_id),
    type: String(row.type),
    email: String(row.email),
    created_at: Number(row.created_at),
  }
}

async function d1Query(client, accountId, databaseId, sql, params) {
  const response = await client.raw(
    'POST',
    `/accounts/${accountId}/d1/database/${databaseId}/query`,
    { body: { sql, params } },
  )
  const result = response?.result?.[0]
  if (!result?.success) throw new Error('D1 query failed')
  return result
}

async function inspectTarget(client, accountId, databaseId) {
  const countResult = await d1Query(client, accountId, databaseId, `
SELECT COUNT(*) AS match_count
  FROM events
 WHERE project_id = ?
   AND type = ?
   AND email = ?
`, [PROJECT_ID, EVENT_TYPE, SYNTHETIC_EMAIL])
  const matchCount = Number(countResult.results?.[0]?.match_count)
  if (!Number.isSafeInteger(matchCount) || matchCount < 0) {
    throw new Error('D1 match count was not a non-negative integer')
  }

  const rowResult = await d1Query(client, accountId, databaseId, `
SELECT id, project_id, type, email, created_at
  FROM events
 WHERE project_id = ?
   AND type = ?
   AND email = ?
 ORDER BY id
`, [PROJECT_ID, EVENT_TYPE, SYNTHETIC_EMAIL])
  const rows = Array.isArray(rowResult.results) ? rowResult.results.map(safeRow) : []

  if (rows.length !== matchCount) {
    throw new Error(`D1 row query returned ${rows.length} rows for a count of ${matchCount}`)
  }
  return { matchCount, rows }
}

function assertExactlyOne(inspection, phase) {
  if (inspection.matchCount !== 1 || inspection.rows.length !== 1) {
    audit({
      action,
      status: 'REFUSED',
      phase,
      database: DATABASE_NAME,
      project: PROJECT_ID,
      type: EVENT_TYPE,
      syntheticEmail: SYNTHETIC_EMAIL,
      expectedMatches: 1,
      actualMatches: inspection.matchCount,
    }, { required: true })
    throw new Error(
      `Refusing ${phase}: expected exactly one fixed synthetic event, found ${inspection.matchCount}`,
    )
  }
  return inspection.rows[0]
}

function printTarget(row) {
  log.info(`D1 database: ${DATABASE_NAME}`)
  log.info(`Matching rows: 1`)
  log.info(`Event id: ${row.id}`)
  log.info(`Project: ${row.project_id}`)
  log.info(`Type: ${row.type}`)
  log.info(`Synthetic email: ${row.email}`)
  log.info(`Created at: ${row.created_at}`)
}

async function main() {
  const rawArgs = process.argv.slice(2)
  const { args, pos, commit } = parseArgs(rawArgs)
  if (
    pos.length
    || Object.keys(args).some((key) => key !== 'commit')
    || rawArgs.length > 1
    || ('commit' in args && args.commit !== true)
  ) {
    fail('usage: node scripts/actions/dpdpa-metrics-smoke-cleanup.mjs [--commit]')
  }

  const read = bootRead()
  const accountId = await resolveAccountId(read)
  const databases = await read.getAll(`/accounts/${accountId}/d1/database`, {
    query: { name: DATABASE_NAME, per_page: 100 },
  })
  const exactDatabases = databases.filter((database) => database.name === DATABASE_NAME)
  if (exactDatabases.length !== 1 || !exactDatabases[0].uuid) {
    throw new Error(`Expected exactly one D1 database named ${DATABASE_NAME}`)
  }
  const databaseId = exactDatabases[0].uuid

  const readInspection = await inspectTarget(read, accountId, databaseId)
  const readRow = assertExactlyOne(readInspection, 'read preflight')
  printTarget(readRow)

  const auditTarget = {
    database: DATABASE_NAME,
    project: PROJECT_ID,
    type: EVENT_TYPE,
    syntheticEmail: SYNTHETIC_EMAIL,
    eventId: readRow.id,
    createdAt: readRow.created_at,
  }

  if (!commit) {
    log.warn('DRY-RUN - exactly one fixed synthetic event was verified. Nothing changed.')
    audit({ action, status: 'DRY_RUN', ...auditTarget }, { required: true })
    return
  }

  const cf = bootEdit(action, auditTarget)
  const editInspection = await inspectTarget(cf, accountId, databaseId)
  const editRow = assertExactlyOne(editInspection, 'commit preflight')
  if (editRow.id !== readRow.id) {
    audit({
      action,
      status: 'REFUSED',
      phase: 'commit preflight',
      ...auditTarget,
      currentEventId: editRow.id,
      reason: 'event id changed after read preflight',
    }, { required: true })
    throw new Error('Refusing commit: the matching event changed after read preflight')
  }

  const deleted = await d1Query(cf, accountId, databaseId, `
DELETE FROM events
 WHERE id = ?
   AND project_id = ?
   AND type = ?
   AND email = ?
RETURNING id
`, [editRow.id, PROJECT_ID, EVENT_TYPE, SYNTHETIC_EMAIL])
  const deletedRows = Array.isArray(deleted.results) ? deleted.results : []
  if (deletedRows.length !== 1 || Number(deletedRows[0].id) !== editRow.id) {
    audit({ action, status: 'FAILED', ...auditTarget, deletedRows: deletedRows.length }, { required: true })
    throw new Error('Synthetic event deletion did not return the one approved event id')
  }

  const after = await inspectTarget(cf, accountId, databaseId)
  if (after.matchCount !== 0 || after.rows.length !== 0) {
    audit({ action, status: 'FAILED', ...auditTarget, remainingMatches: after.matchCount }, { required: true })
    throw new Error('Synthetic event deletion verification failed')
  }

  audit({ action, status: 'COMMITTED', ...auditTarget, remainingMatches: 0 }, { required: true })
  log.ok('Deleted the one fixed synthetic DPDPA Metrics contact and verified zero matches remain.')
}

await main()
