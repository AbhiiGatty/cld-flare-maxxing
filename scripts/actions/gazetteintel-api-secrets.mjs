#!/usr/bin/env node
/**
 * Guarded action: install the GazetteIntel API session and ingestion secrets.
 *
 * Fixed target: Worker `gazetteintel-api`. Installs `JWT_SECRET` (HS256 session
 * key) and `INGESTION_TOKEN` (collector/extractor bearer token) as encrypted
 * Worker secrets. Values are generated locally with 32 random bytes each. The
 * ingestion token is written once to a gitignored VM env file as
 * `GAZETTEINTEL_INGESTION_TOKEN`; the JWT secret is written nowhere else.
 * Neither value is printed or audited.
 *
 * `--rotate` replaces both secrets (every session signs out; VM env is rewritten).
 * DRY-RUN by default; --commit mutates.
 */
import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { DIRS } from '../lib/paths.mjs'
import { loadEnv } from '../lib/util.mjs'
import { makeClient, resolveAccountId } from '../lib/cf.mjs'
import { audit, bootEdit, log, parseArgs } from './_lib.mjs'

const action = 'gazetteintel-api-secrets'
const worker = 'gazetteintel-api'
const secretNames = ['JWT_SECRET', 'INGESTION_TOKEN']
const { args, commit } = parseArgs(process.argv.slice(2))
const outputInput = String(args.output || '')
const rotate = args.rotate === true || args.rotate === 'true'

if (!outputInput || !isAbsolute(outputInput) || !outputInput.toLowerCase().endsWith('.env')) {
  log.err('usage: --output=<absolute-gitignored-vm-env-file> [--rotate] [--commit]')
  process.exit(1)
}
const output = resolve(outputInput)

loadEnv(DIRS.env)
const read = makeClient({ mode: 'read' })
const accountId = await resolveAccountId(read)

async function installedSecrets(client) {
  const list = await client.getAll(`/accounts/${accountId}/workers/scripts/${worker}/secrets`, { query: { per_page: 100 } })
    .catch((error) => { throw new Error(`Worker ${worker} secrets are not readable: ${error.message}`) })
  return new Set(list.map((item) => String(item?.name || '')))
}

const before = await installedSecrets(read)
const plan = secretNames.map((name) => ({ name, present: before.has(name), install: rotate || !before.has(name) }))
const writeEnv = plan.find((item) => item.name === 'INGESTION_TOKEN').install

if (writeEnv && existsSync(output) && !rotate) {
  throw new Error(`VM env file already exists but INGESTION_TOKEN is not installed; re-run with --rotate to replace both: ${output}`)
}
if (!writeEnv && !existsSync(output)) {
  log.warn(`INGESTION_TOKEN is installed but the VM env file is missing (${output}); use --rotate to issue a new token.`)
}

log.info(`Worker: ${worker}`)
for (const item of plan) log.info(`Secret ${item.name}: ${item.present ? 'installed' : 'absent'} -> ${item.install ? (item.present ? 'rotate' : 'create') : 'keep'}`)
log.info(`VM env file: ${output} ${writeEnv ? '(write GAZETTEINTEL_INGESTION_TOKEN once, mode 0600)' : '(unchanged)'}`)
log.info('Secret values are generated locally and never printed or audited.')
if (rotate) log.warn('Rotating JWT_SECRET signs out every GazetteIntel session immediately.')

if (!commit) {
  log.warn('DRY-RUN - nothing changed. Re-run with --commit to apply.')
  audit({ action, status: 'DRY_RUN', worker, plan: plan.map(({ name, present, install }) => ({ name, present, install })), output, rotate })
  process.exit(0)
}

const cf = bootEdit(action, { worker, secretNames: plan.filter((item) => item.install).map((item) => item.name), output, rotate })
const values = Object.fromEntries(plan.filter((item) => item.install).map((item) => [item.name, randomBytes(32).toString('base64url')]))

for (const name of Object.keys(values)) {
  await cf.raw('PUT', `/accounts/${accountId}/workers/scripts/${worker}/secrets`, {
    body: { name, text: values[name], type: 'secret_text' },
  })
  audit({ action, status: 'COMMITTED', step: `put-secret-${name}`, worker })
  log.ok(`installed ${name} on ${worker}`)
}

if (writeEnv) {
  mkdirSync(dirname(output), { recursive: true, mode: 0o700 })
  const temporary = `${output}.tmp`
  writeFileSync(temporary, [
    `GAZETTEINTEL_INGESTION_TOKEN=${values.INGESTION_TOKEN}`,
    'GAZETTEINTEL_API=https://api.gazetteintel.com',
    '',
  ].join('\n'), { encoding: 'utf8', mode: 0o600 })
  try { chmodSync(temporary, 0o600) } catch { /* Windows ACLs are managed separately. */ }
  renameSync(temporary, output)
  audit({ action, status: 'COMMITTED', step: 'write-vm-env', output })
  log.ok('wrote the VM ingestion env file')
}

const after = await installedSecrets(cf)
if (!secretNames.every((name) => after.has(name)) || (writeEnv && !existsSync(output))) {
  audit({ action, status: 'FAILED', step: 'verify', worker })
  throw new Error('GazetteIntel API secret verification failed')
}
audit({ action, status: 'COMMITTED', step: 'verified', worker, secretNames, output })
log.ok('GazetteIntel API secrets are installed. Copy the VM env file to vm-ops secrets; it is the only copy of the ingestion token.')
