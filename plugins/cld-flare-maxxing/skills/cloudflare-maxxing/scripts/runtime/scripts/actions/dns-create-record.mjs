#!/usr/bin/env node
/**
 * Guarded action: create a DNS record.
 *
 * DRY-RUN by default. Add --commit to actually create.
 * Requires break-glass: CF_EDIT_TOKEN (.env.break-glass) + CF_ALLOW_DESTRUCTIVE=YES_I_AM_SURE
 *
 * Example:
 *   CF_ALLOW_DESTRUCTIVE=YES_I_AM_SURE node scripts/actions/dns-create-record.mjs \
 *     --zone=example.com --type=A --name=test.example.com --content=192.0.2.10 --proxied=true --commit
 */
import { join } from 'node:path'
import { DIRS } from '../lib/paths.mjs'
import { loadEnv } from '../lib/util.mjs'
import { makeClient } from '../lib/cf.mjs'
import { bootEdit, parseArgs, resolveZone, log, audit } from './_lib.mjs'

const { args, commit } = parseArgs(process.argv.slice(2))
const action = 'dns-create-record'

if (!args.type || !args.name || args.content === undefined) {
  log.err('usage: --zone=<id|name> --type=A --name=host --content=value [--proxied=true] [--ttl=1] [--commit]')
  process.exit(1)
}

const body = {
  type: String(args.type).toUpperCase(),
  name: args.name,
  content: String(args.content),
  ttl: args.ttl ? Number(args.ttl) : 1,
  proxied: args.proxied === true || args.proxied === 'true',
}
log.info('intended record:', JSON.stringify(body))

if (!commit) {
  loadEnv(DIRS.env)
  const read = makeClient({ mode: 'read' })
  const zoneId = await resolveZone(read, args.zone)
  log.warn('DRY-RUN — nothing created. Re-run with --commit to apply.')
  audit({ action, status: 'DRY_RUN', zoneId, body })
  process.exit(0)
}

const cf = bootEdit(action, { zone: args.zone, name: args.name, type: args.type })
const zoneId = await resolveZone(cf, args.zone)
const result = await cf.raw('POST', `/zones/${zoneId}/dns_records`, { body })
audit({ action, status: 'COMMITTED', zoneId, body, resultId: result?.result?.id })
log.ok(`created record ${result?.result?.id} (${body.type} ${body.name})`)
