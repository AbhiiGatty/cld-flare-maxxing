#!/usr/bin/env node
/**
 * Guarded action: deploy the GazetteIntel API and app Workers.
 *
 * The source must be a clean checkout at the current origin/main commit. The action never seeds
 * the demo corpus. It sends ADMIN_EMAILS to Wrangler on stdin only.
 */
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { DIRS } from '../lib/paths.mjs'
import { loadEnv } from '../lib/util.mjs'
import { makeClient, resolveAccountId } from '../lib/cf.mjs'
import { audit, bootEdit, commandEnv, log, parseArgs, wranglerExecutable } from './_lib.mjs'

const action = 'gazetteintel-deploy'
const { args, commit } = parseArgs(process.argv.slice(2))
const sourceInput = String(args.source || '')
const apiWorker = 'gazetteintel-api'
const appWorker = 'gazetteintel-app'
const database = 'gazette-ledger'

if (!sourceInput || !isAbsolute(sourceInput)) {
  log.err('usage: --source=<absolute-clean-GazetteIntel-main-checkout> [--commit]')
  process.exit(1)
}

const source = resolve(sourceInput)
const files = [
  'package.json', 'package-lock.json', 'api/wrangler.jsonc',
  'app-worker/wrangler.jsonc', 'app-worker/index.ts',
]
if (files.some((file) => !existsSync(join(source, file)))) {
  log.err('source is missing the committed GazetteIntel API or app Worker files')
  process.exit(1)
}

function git(args) {
  return spawnSync('git', ['-C', source, ...args], { encoding: 'utf8' })
}

const status = String(git(['status', '--porcelain']).stdout || '').trim()
const head = String(git(['rev-parse', 'HEAD']).stdout || '').trim()
const main = String(git(['rev-parse', 'origin/main']).stdout || '').trim()
if (status || !head || head !== main) {
  log.err('source must be a clean checkout at the current origin/main commit')
  process.exit(1)
}

const apiConfig = readFileSync(join(source, 'api/wrangler.jsonc'), 'utf8')
const appConfig = readFileSync(join(source, 'app-worker/wrangler.jsonc'), 'utf8')
if (
  !apiConfig.includes(apiWorker) || !apiConfig.includes(database) || !apiConfig.includes('api.gazetteintel.com')
  || !appConfig.includes(appWorker) || !appConfig.includes('app.gazetteintel.com')
) {
  log.err('the Worker configuration does not match the fixed GazetteIntel production resources')
  process.exit(1)
}

loadEnv(DIRS.env)
const read = makeClient({ mode: 'read' })
const accountId = await resolveAccountId(read)
const services = await read.getAll(`/accounts/${accountId}/workers/services`, { query: { per_page: 100 } }).catch(() => [])
const serviceNames = new Set(services.map((service) => String(service.id || service.default_environment?.script?.name || '')))

log.info(`source: ${source}`)
log.info(`commit: ${head.slice(0, 7)}`)
log.info(`D1 migrations: apply pending migrations to ${database}`)
log.info(`API Worker: ${apiWorker} (${serviceNames.has(apiWorker) ? 'update' : 'create'}) at api.gazetteintel.com`)
log.info(`App Worker: ${appWorker} (${serviceNames.has(appWorker) ? 'update' : 'create'}) at app.gazetteintel.com`)
log.info('Worker secret: ADMIN_EMAILS (read from the local environment; value is never printed or audited)')
log.info('The demo SQL corpus is intentionally not applied to production.')

if (!commit) {
  log.warn('DRY-RUN - nothing changed. Re-run with --commit to apply.')
  audit({ action, status: 'DRY_RUN', source, commit: head, database, apiWorker, appWorker })
  process.exit(0)
}

const adminEmails = String(process.env.GAZETTEINTEL_ADMIN_EMAILS || '').trim().toLowerCase()
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+(?:,[^\s@]+@[^\s@]+\.[^\s@]+)*$/.test(adminEmails)) {
  log.err('GAZETTEINTEL_ADMIN_EMAILS must contain one or more comma-separated email addresses')
  process.exit(1)
}

function run(label, command, commandArgs, env, options = {}) {
  log.info(label)
  const result = spawnSync(command, commandArgs, {
    cwd: source,
    env,
    encoding: 'utf8',
    input: options.input,
  })
  const output = `${result.stdout || ''}${result.stderr || ''}`
  if (!options.quiet && output.trim()) process.stdout.write(output.endsWith('\n') ? output : `${output}\n`)
  if (result.error || result.status !== 0) {
    audit({ action, status: 'FAILED', step: label, code: result.status, error: result.error?.message })
    throw new Error(`${label} failed`)
  }
  return result.stdout || ''
}

function npmCommand() {
  if (process.platform !== 'win32') return { command: 'npm', args: [] }
  const paths = String(process.env.Path || process.env.PATH || '').split(';').filter(Boolean)
  for (const path of paths) {
    const cli = join(path, 'node_modules', 'npm', 'bin', 'npm-cli.js')
    if (existsSync(cli)) return { command: process.execPath, args: [cli] }
  }
  throw new Error('npm-cli.js was not found on PATH')
}

const cf = bootEdit(action, { source, commit: head, database, apiWorker, appWorker, secretNames: ['ADMIN_EMAILS'] })
const mutationEnv = commandEnv({ CLOUDFLARE_API_TOKEN: cf.token, CLOUDFLARE_ACCOUNT_ID: accountId })
const wrangler = wranglerExecutable(source)
const npm = npmCommand()

run('install locked GazetteIntel dependencies', npm.command, [...npm.args, 'ci'], commandEnv())
run('build GazetteIntel static assets', npm.command, [...npm.args, 'run', 'build'], commandEnv())
run('apply remote D1 migrations', process.execPath, [wrangler, 'd1', 'migrations', 'apply', database, '--remote', '--config', 'api/wrangler.jsonc'], mutationEnv)
run('deploy API Worker and Custom Domain', process.execPath, [wrangler, 'deploy', '--config', 'api/wrangler.jsonc'], mutationEnv)
run('set API admin allowlist', process.execPath, [wrangler, 'secret', 'put', 'ADMIN_EMAILS', '--config', 'api/wrangler.jsonc'], mutationEnv, { input: `${adminEmails}\n`, quiet: true })
run('deploy app Worker and Custom Domain', process.execPath, [wrangler, 'deploy', '--config', 'app-worker/wrangler.jsonc'], mutationEnv)

const afterServices = await read.getAll(`/accounts/${accountId}/workers/services`, { query: { per_page: 100 } })
const afterNames = new Set(afterServices.map((service) => String(service.id || service.default_environment?.script?.name || '')))
if (!afterNames.has(apiWorker) || !afterNames.has(appWorker)) throw new Error('Worker service verification failed')

audit({ action, status: 'COMMITTED', source, commit: head, database, apiWorker, appWorker, step: 'verified' })
log.ok('GazetteIntel API and app Workers deployed. DNS and TLS can take several minutes to propagate.')
