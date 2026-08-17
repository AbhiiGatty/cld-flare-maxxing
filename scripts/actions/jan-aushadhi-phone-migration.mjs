#!/usr/bin/env node
/**
 * Guarded action: apply the fixed Jan Aushadhi D1 migrations required for
 * manual email and phone price-watch requests. Dry-run is the default.
 */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolveAccountId } from '../lib/cf.mjs'
import {
  audit,
  bootEdit,
  bootRead,
  commandEnv,
  log,
  parseArgs,
  wranglerExecutable,
} from './_lib.mjs'

const action = 'jan-aushadhi-phone-migration'
const actionDirectory = dirname(fileURLToPath(import.meta.url))
const maxxingRoot = resolve(actionDirectory, '..', '..')
const EXPECTED_SOURCE = resolve(maxxingRoot, '..', 'jan-aushadhi-finder')
const EXPECTED_DATABASE = 'jan-aushadhi-subscribers'
const EXPECTED_CONTACT_MIGRATIONS = Object.freeze([
  '0003_price_watch_phone_requests.sql',
  '0004_price_watch_email_requests.sql',
])
const EXPECTED_MIGRATIONS = Object.freeze([
  '0001_catalogue_updates_topic.sql',
  '0002_stack_suggestions.sql',
  ...EXPECTED_CONTACT_MIGRATIONS,
])
const APPROVED_FILES = Object.freeze({
  'package.json': '37021f574f105749478508fbdf03b0b3b7263cc65b215479c0820e15ba38d8e8',
  'package-lock.json': 'cdb61514477088d1b90745e92a7cdd6b7e96673ef28a4d0b5f2dfd2a2db9a4c5',
  'wrangler.toml': '9c9da99f7fb5fb95b3717b735b050ccf3e5804a197d4eba1367fe2d475682abd',
  'migrations/0003_price_watch_phone_requests.sql': 'ad6c1bc2e5c068cc534254a3f848293393268fcb626f27d77b9e38450579e0b8',
  'migrations/0004_price_watch_email_requests.sql': '6e170399233c075afa40e485940ea0408ed69cddd125cdb780dc0ad7fb0e9bae',
})

function fail(message) {
  throw new Error(message)
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function validateSource() {
  if (!existsSync(EXPECTED_SOURCE) || lstatSync(EXPECTED_SOURCE).isSymbolicLink()) {
    fail(`expected sibling Jan Aushadhi repository is missing or linked: ${EXPECTED_SOURCE}`)
  }
  for (const [relativePath, approvedHash] of Object.entries(APPROVED_FILES)) {
    const path = join(EXPECTED_SOURCE, relativePath)
    if (!existsSync(path) || lstatSync(path).isSymbolicLink()) {
      fail(`approved Jan Aushadhi source file is missing or linked: ${relativePath}`)
    }
    if (sha256(path) !== approvedHash) fail(`approved Jan Aushadhi source fingerprint changed: ${relativePath}`)
  }

  const migrations = readdirSync(join(EXPECTED_SOURCE, 'migrations'))
    .filter((name) => name.endsWith('.sql'))
    .sort()
  if (
    migrations.length !== EXPECTED_MIGRATIONS.length
    || migrations.some((name, index) => name !== [...EXPECTED_MIGRATIONS].sort()[index])
  ) {
    fail('Jan Aushadhi migration directory does not match the fixed approved list')
  }

  const lock = JSON.parse(readFileSync(join(EXPECTED_SOURCE, 'package-lock.json'), 'utf8'))
  const config = readFileSync(join(EXPECTED_SOURCE, 'wrangler.toml'), 'utf8')
  const lockedWrangler = lock.packages?.['node_modules/wrangler']?.version
  if (
    typeof lockedWrangler !== 'string'
    || !config.includes(`database_name = "${EXPECTED_DATABASE}"`)
    || !config.includes('migrations_dir = "./migrations"')
  ) {
    fail('Jan Aushadhi repository is not the approved fixed D1 migration source')
  }
  const executable = wranglerExecutable(EXPECTED_SOURCE)
  const installed = JSON.parse(
    readFileSync(join(EXPECTED_SOURCE, 'node_modules', 'wrangler', 'package.json'), 'utf8'),
  ).version
  if (installed !== lockedWrangler) fail(`installed Wrangler ${installed} does not match lockfile ${lockedWrangler}`)
  return { executable, lockedWrangler }
}

function parseCommandLine() {
  const rawArgs = process.argv.slice(2)
  const { args, pos, commit } = parseArgs(rawArgs)
  if (
    pos.length
    || Object.keys(args).some((key) => key !== 'commit')
    || rawArgs.length > 1
    || ('commit' in args && args.commit !== true)
  ) {
    fail('usage: node scripts/actions/jan-aushadhi-phone-migration.mjs [--commit]')
  }
  return { commit }
}

function runWrangler(label, executable, args, env) {
  const result = spawnSync(process.execPath, [executable, ...args], {
    cwd: EXPECTED_SOURCE,
    env,
    encoding: 'utf8',
  })
  if (result.error || result.status !== 0) {
    audit({ action, status: 'FAILED', step: label, code: result.status, signal: result.signal })
    fail(`${label} failed with exit code ${result.status ?? 1}; child output was withheld`)
  }
  return result.stdout
}

function migrationState(output) {
  if (EXPECTED_CONTACT_MIGRATIONS.some((migration) => output.includes(migration))) return 'pending'
  if (/no migrations to apply/i.test(output)) return 'applied'
  fail('Wrangler returned an unexpected remote migration list')
}

async function main() {
  const { commit } = parseCommandLine()
  const approved = validateSource()
  const read = bootRead()
  const readAccountId = await resolveAccountId(read)
  const readEnv = commandEnv({
    CLOUDFLARE_API_TOKEN: read.token,
    CLOUDFLARE_ACCOUNT_ID: readAccountId,
    NO_UPDATE_NOTIFIER: '1',
  })
  const observedOutput = runWrangler(
    'inspect fixed remote D1 migration',
    approved.executable,
    ['d1', 'migrations', 'list', EXPECTED_DATABASE, '--remote'],
    readEnv,
  )
  const observedState = migrationState(observedOutput)

  log.info(`source: ${EXPECTED_SOURCE}`)
  log.info(`D1 database: ${EXPECTED_DATABASE}`)
  log.info(`migrations: ${EXPECTED_CONTACT_MIGRATIONS.join(', ')}`)
  log.info(`pinned Wrangler: ${approved.lockedWrangler}`)

  const auditDetails = {
    source: EXPECTED_SOURCE,
    database: EXPECTED_DATABASE,
    migrations: EXPECTED_CONTACT_MIGRATIONS,
    observedState,
  }
  if (!commit) {
    if (observedState === 'applied') log.ok('DRY-RUN: the fixed migration is already applied; nothing would change.')
    else log.warn('DRY-RUN: would apply the fixed manual price-watch migrations to the fixed D1 database.')
    audit({ action, status: 'DRY_RUN', ...auditDetails }, { required: true })
    return
  }

  const cf = bootEdit(action, auditDetails)
  const editAccountId = await resolveAccountId(cf)
  if (editAccountId !== readAccountId) fail('read and edit tokens resolved to different Cloudflare accounts')
  const mutationEnv = commandEnv({
    CLOUDFLARE_API_TOKEN: cf.token,
    CLOUDFLARE_ACCOUNT_ID: editAccountId,
    NO_UPDATE_NOTIFIER: '1',
    CI: '1',
  })
  const currentOutput = runWrangler(
    'repeat fixed remote D1 migration preflight',
    approved.executable,
    ['d1', 'migrations', 'list', EXPECTED_DATABASE, '--remote'],
    mutationEnv,
  )
  const currentState = migrationState(currentOutput)
  if (currentState !== observedState) fail('remote D1 migration state changed after dry-run preflight')

  if (currentState === 'applied') {
    audit({ action, status: 'COMMITTED', noChange: true, ...auditDetails }, { required: true })
    log.ok('The fixed manual price-watch migrations are already applied. No D1 write was sent.')
    return
  }

  runWrangler(
    'apply fixed manual price-watch migrations',
    approved.executable,
    ['d1', 'migrations', 'apply', EXPECTED_DATABASE, '--remote'],
    mutationEnv,
  )
  const verifiedOutput = runWrangler(
    'verify fixed manual price-watch migrations',
    approved.executable,
    ['d1', 'migrations', 'list', EXPECTED_DATABASE, '--remote'],
    mutationEnv,
  )
  if (migrationState(verifiedOutput) !== 'applied') fail('fresh migration list still reports a fixed contact migration as pending')

  audit({ action, status: 'COMMITTED', noChange: false, ...auditDetails }, { required: true })
  log.ok('Applied and verified the fixed manual price-watch migrations.')
}

try {
  await main()
} catch (error) {
  audit({
    action,
    status: 'FAILED',
    reason: error instanceof Error ? error.message : 'unknown error',
  })
  log.err(error instanceof Error ? error.message : 'unknown error')
  process.exitCode = 1
}
