#!/usr/bin/env node
/**
 * Guarded action: purge Cloudflare cache (DESTRUCTIVE — can spike origin load).
 *
 * DRY-RUN by default. --commit to apply. Requires break-glass.
 *
 * Examples:
 *   ... purge-cache.mjs --zone=example.com --files=https://example.com/a.js,https://example.com/b.css --commit
 *   ... purge-cache.mjs --zone=example.com --everything --commit
 */
import { bootEdit, bootRead, parseArgs, resolveZone, log, audit } from './_lib.mjs'

const { args, commit } = parseArgs(process.argv.slice(2))
const action = 'purge-cache'

const read = bootRead()
const zoneId = await resolveZone(read, args.zone)

let body
if (args.everything) body = { purge_everything: true }
else if (args.files) body = { files: String(args.files).split(',').map((s) => s.trim()).filter(Boolean) }
else { log.err('provide --files=url1,url2 OR --everything'); process.exit(1) }

log.info('purge body:', JSON.stringify(body))
if (!commit) {
  log.warn('DRY-RUN — nothing purged. Re-run with --commit to apply.')
  audit({ action, status: 'DRY_RUN', zoneId, body })
  process.exit(0)
}

const cf = bootEdit(action, { zoneId, everything: !!args.everything })
await cf.raw('POST', `/zones/${zoneId}/purge_cache`, { body })
audit({ action, status: 'COMMITTED', zoneId, body })
log.ok(`purge requested for zone ${zoneId}`)
