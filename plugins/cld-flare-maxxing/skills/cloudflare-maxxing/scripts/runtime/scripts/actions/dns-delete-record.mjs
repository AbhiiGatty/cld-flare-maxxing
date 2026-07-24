#!/usr/bin/env node
/**
 * Guarded action: delete a DNS record (DESTRUCTIVE).
 *
 * DRY-RUN by default — shows exactly which record would be deleted.
 * Add --commit to actually delete. Requires break-glass.
 *
 * Example (find by name/type, then delete):
 *   CF_ALLOW_DESTRUCTIVE=YES_I_AM_SURE node scripts/actions/dns-delete-record.mjs \
 *     --zone=example.com --name=test.example.com --type=A --commit
 *   (or pass --record=<recordId> directly)
 */
import { bootEdit, bootRead, parseArgs, resolveZone, log, audit } from './_lib.mjs'

const { args, commit } = parseArgs(process.argv.slice(2))
const action = 'dns-delete-record'

const read = bootRead()
const zoneId = await resolveZone(read, args.zone)

let recordId = args.record
let record
if (!recordId) {
  if (!args.name) { log.err('provide --record=<id> OR --name=<host> [--type=A]'); process.exit(1) }
  const q = { name: args.name, per_page: 50 }
  if (args.type) q.type = String(args.type).toUpperCase()
  const matches = await read.getAll(`/zones/${zoneId}/dns_records`, { query: q })
  if (matches.length === 0) { log.err('no matching record'); process.exit(1) }
  if (matches.length > 1) { log.err(`${matches.length} records match — narrow with --type or use --record=<id>:`); matches.forEach((m) => log.dim(`   ${m.id}  ${m.type} ${m.name} -> ${m.content}`)); process.exit(1) }
  record = matches[0]
  recordId = record.id
} else {
  record = await read.get(`/zones/${zoneId}/dns_records/${recordId}`)
}

log.warn(`target: ${record.type} ${record.name} -> ${record.content} (id ${recordId})`)
if (!commit) {
  log.warn('DRY-RUN — nothing deleted. Re-run with --commit to apply.')
  audit({ action, status: 'DRY_RUN', zoneId, recordId, record: { type: record.type, name: record.name, content: record.content } })
  process.exit(0)
}

const cf = bootEdit(action, { zoneId, recordId, name: record.name })
await cf.raw('DELETE', `/zones/${zoneId}/dns_records/${recordId}`)
audit({ action, status: 'COMMITTED', zoneId, recordId, record: { type: record.type, name: record.name, content: record.content } })
log.ok(`deleted record ${recordId}`)
