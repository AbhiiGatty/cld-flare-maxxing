#!/usr/bin/env node
/**
 * Guarded action: apply Social Desk D1 migrations and deploy its Worker.
 *
 * Accepts either the standalone Social Desk repo or its former tooling/social
 * location inside the GattyWorks repo. Use --migrations-only to apply D1
 * migrations without deploying Worker code.
 *
 * Requires an absolute source path plus explicit Worker, D1, and domain names.
 * DRY-RUN by default. Add --commit to mutate the account.
 */
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { DIRS } from '../lib/paths.mjs'
import { loadEnv } from '../lib/util.mjs'
import { makeClient, resolveAccountId } from '../lib/cf.mjs'
import {
  bootEdit,
  commandEnv,
  npmExecutable,
  parseArgs,
  wranglerExecutable,
  log,
  audit,
} from './_lib.mjs'

const { args, commit } = parseArgs(process.argv.slice(2))
const action = 'social-desk-deploy'
const sourceInput = String(args.source || '')
const workerName = String(args.worker || '')
const databaseName = String(args.database || '')
const domain = String(args.domain || '').toLowerCase()
const migrationsOnly = args['migrations-only'] === true || args['migrations-only'] === 'true'

if (!sourceInput || !isAbsolute(sourceInput) || !workerName || !databaseName || !domain) {
  log.err('usage: --source=<absolute-repo-path> --worker=<worker-name> --database=<d1-name> --domain=<custom-domain> [--migrations-only] [--commit]')
  process.exit(1)
}
if (
  !/^[a-z0-9-]+$/.test(workerName)
  || !/^[a-z0-9-]+$/.test(databaseName)
  || !/^[a-z0-9.-]+$/.test(domain)
  || !domain.includes('.')
) {
  log.err('worker, database, or domain argument is invalid')
  process.exit(1)
}

const source = resolve(sourceInput)
const standaloneConfig = join(source, 'cloud', 'wrangler.jsonc')
const standalonePackage = join(source, 'package.json')
const socialDir = existsSync(standaloneConfig) && existsSync(standalonePackage)
  ? source
  : join(source, 'tooling', 'social')
const config = join(socialDir, 'cloud', 'wrangler.jsonc')
const packageFile = join(socialDir, 'package.json')

if (!existsSync(config) || !existsSync(packageFile)) {
  log.err('source does not contain tooling/social cloud configuration')
  process.exit(1)
}

const configText = readFileSync(config, 'utf8')
if (
  configText.includes('REPLACE_AFTER_')
  || !configText.includes(domain)
  || !configText.includes(workerName)
  || !configText.includes(databaseName)
) {
  log.err('Social Desk Wrangler configuration does not contain the requested Worker, D1, and domain names')
  process.exit(1)
}

loadEnv(DIRS.env)
const read = makeClient({ mode: 'read' })
const accountId = await resolveAccountId(read)
const services = await read.getAll(`/accounts/${accountId}/workers/services`, {
  query: { per_page: 100 },
}).catch(() => [])
const workerExists = services.some(
  (item) => item.default_environment?.script?.name === workerName || item.id === workerName,
)

log.info(`source: ${source}`)
log.info(`Worker ${workerName}: ${migrationsOnly ? 'skip deploy' : workerExists ? 'update' : 'create'}`)
log.info(`D1 migrations: apply pending migrations to ${databaseName}`)
log.info(`Custom Domain: ${domain}`)
log.info('Meta secrets and public Meta actions are not part of this deployment.')

if (!commit) {
  log.warn('DRY-RUN - nothing changed. Re-run with --commit to apply.')
  audit({ action, status: 'DRY_RUN', source, workerExists, migrationsOnly })
} else {
  await applyRelease()
}

async function applyRelease() {
function run(label, command, commandArgs, env) {
  log.info(label)
  const result = spawnSync(command, commandArgs, {
    cwd: socialDir,
    env,
    encoding: 'utf8',
  })
  const output = `${result.stdout || ''}${result.stderr || ''}`
  if (output.trim()) process.stdout.write(output.endsWith('\n') ? output : `${output}\n`)
  if (result.error || result.status !== 0) {
    audit({
      action,
      status: 'FAILED',
      step: label,
      error: result.error?.message,
      code: result.status,
    })
    throw new Error(`${label} failed with exit code ${result.status ?? 1}`)
  }
}

if (!migrationsOnly) {
  const buildEnv = commandEnv()
  run('install locked Social Desk dependencies', npmExecutable(), ['ci'], buildEnv)
  run('build Social Desk assets', npmExecutable(), ['run', 'build'], buildEnv)
}

const cf = bootEdit(action, {
  source,
  worker: workerName,
  database: databaseName,
  domain,
})
const mutationEnv = commandEnv({
  CLOUDFLARE_API_TOKEN: cf.token,
  CLOUDFLARE_ACCOUNT_ID: accountId,
})
const wranglerBin = wranglerExecutable(socialDir)

run('apply remote D1 migrations', process.execPath, [
  wranglerBin,
  'd1',
  'migrations',
  'apply',
  databaseName,
  '--remote',
  '--config',
  'cloud/wrangler.jsonc',
], mutationEnv)
if (!migrationsOnly) {
  run('deploy Worker and Custom Domain', process.execPath, [
    wranglerBin,
    'deploy',
    '--config',
    'cloud/wrangler.jsonc',
  ], mutationEnv)
}

if (!migrationsOnly) {
  const service = await cf.get(
    `/accounts/${accountId}/workers/services/${encodeURIComponent(workerName)}`,
  )
  if (!service) throw new Error('Worker service verification failed.')
}

audit({
  action,
  status: 'COMMITTED',
  source,
  worker: workerName,
  database: databaseName,
  domain,
  migrationsOnly,
  step: 'verified',
})
log.ok(migrationsOnly
  ? 'Social Desk migrations applied.'
  : 'Social Desk migrations applied and Worker deployed.')
}
