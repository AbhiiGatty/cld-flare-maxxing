#!/usr/bin/env node
/**
 * Guarded action: apply Deep Research D1 migrations, deploy its Worker, and
 * install the runner credentials as Worker secrets.
 *
 * Requires the one-time credential bundle produced by
 * deep-research-provision.mjs. Secret values are sent to Wrangler over stdin
 * and are never printed or audited.
 *
 * DRY-RUN by default. Add --commit to mutate the account.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
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
const action = 'deep-research-deploy'
const sourceInput = String(args.source || '')
const workerName = String(args.worker || '')
const databaseName = String(args.database || '')
const domain = String(args.domain || '').toLowerCase()
const secretFile = join(DIRS.root, 'secrets', 'deep-research.json')

if (!sourceInput || !isAbsolute(sourceInput) || !workerName || !databaseName || !domain) {
  log.err(
    'usage: --source=<absolute-repo-path> --worker=<worker-name> '
      + '--database=<d1-name> --domain=<custom-domain> [--commit]',
  )
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
const config = join(source, 'wrangler.jsonc')
const packageFile = join(source, 'package.json')

if (!existsSync(config) || !existsSync(packageFile)) {
  log.err('source does not contain the Deep Research Worker configuration')
  process.exit(1)
}
if (!existsSync(secretFile)) {
  log.err(`runner credential bundle is missing: ${secretFile}`)
  process.exit(1)
}

const configText = readFileSync(config, 'utf8')
if (
  configText.includes('REPLACE_AFTER_')
  || !configText.includes(domain)
  || !configText.includes(workerName)
  || !configText.includes(databaseName)
  || !/"database_id"\s*:\s*"[0-9a-f-]{36}"/i.test(configText)
) {
  log.err('Wrangler configuration is incomplete or does not match the requested Worker, D1, and domain')
  process.exit(1)
}

const credentials = JSON.parse(readFileSync(secretFile, 'utf8'))
const secretPayload = {
  RUNNER_HMAC_SECRET: credentials.runnerHmacSecret,
  RUNNER_ACCESS_CLIENT_ID: credentials.runnerAccessClientId,
  RUNNER_ACCESS_CLIENT_SECRET: credentials.runnerAccessClientSecret,
}
if (Object.values(secretPayload).some((value) => typeof value !== 'string' || !value)) {
  log.err('runner credential bundle is incomplete')
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
log.info(`Worker ${workerName}: ${workerExists ? 'update' : 'create'}`)
log.info(`D1 migrations: apply pending migrations to ${databaseName}`)
log.info(`Custom Domain: ${domain}`)
log.info(`Worker secrets: ${Object.keys(secretPayload).join(', ')}`)

if (!commit) {
  log.warn('DRY-RUN - nothing changed. Re-run with --commit to apply.')
  audit({
    action,
    status: 'DRY_RUN',
    source,
    workerName,
    databaseName,
    domain,
    workerExists,
    secretNames: Object.keys(secretPayload),
  })
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
  if (options.suppressOutput !== true && output.trim()) {
    process.stdout.write(output.endsWith('\n') ? output : `${output}\n`)
  }
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
  return result.stdout || ''
}

if (commit) {
  const buildEnv = commandEnv()
  const npmCommand = process.platform === 'win32' ? process.execPath : npmExecutable()
  const npmCli = process.platform === 'win32'
    ? join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
    : null
  if (npmCli && !existsSync(npmCli)) {
    throw new Error(`Pinned npm CLI is missing at ${npmCli}`)
  }
  const npmArgs = (args) => npmCli ? [npmCli, ...args] : args
  if (existsSync(join(source, 'node_modules'))) {
    run(
      'verify installed Deep Research dependencies',
      npmCommand,
      npmArgs(['ls', '--depth=0']),
      buildEnv,
    )
  } else {
    run('install locked Deep Research dependencies', npmCommand, npmArgs(['ci']), buildEnv)
  }
  run('run Deep Research checks', npmCommand, npmArgs(['run', 'check']), buildEnv)

  const cf = bootEdit(action, {
    source,
    worker: workerName,
    database: databaseName,
    domain,
    secretNames: Object.keys(secretPayload),
  })
  const mutationEnv = commandEnv({
    CLOUDFLARE_API_TOKEN: cf.token,
    CLOUDFLARE_ACCOUNT_ID: accountId,
  })
  const wranglerBin = wranglerExecutable(source)

  run('apply remote D1 migrations', process.execPath, [
    wranglerBin,
    'd1',
    'migrations',
    'apply',
    databaseName,
    '--remote',
    '--config',
    'wrangler.jsonc',
  ], mutationEnv)
  run('deploy Worker and Custom Domain', process.execPath, [
    wranglerBin,
    'deploy',
    '--config',
    'wrangler.jsonc',
  ], mutationEnv)
  run(
    'install runner Worker secrets',
    process.execPath,
    [wranglerBin, 'secret', 'bulk', '--config', 'wrangler.jsonc'],
    mutationEnv,
    { input: JSON.stringify(secretPayload), suppressOutput: true },
  )

  const service = await cf.get(
    `/accounts/${accountId}/workers/services/${encodeURIComponent(workerName)}`,
  )
  if (!service) throw new Error('Worker service verification failed')

  const secretListOutput = run(
    'verify Worker secret names',
    process.execPath,
    [wranglerBin, 'secret', 'list', '--config', 'wrangler.jsonc'],
    mutationEnv,
    { suppressOutput: true },
  )
  const installedSecretNames = new Set(
    JSON.parse(secretListOutput).map((item) => String(item.name || '')),
  )
  const missingSecrets = Object.keys(secretPayload).filter((name) => !installedSecretNames.has(name))
  if (missingSecrets.length) {
    throw new Error(`Worker secret verification failed for: ${missingSecrets.join(', ')}`)
  }

  audit({
    action,
    status: 'COMMITTED',
    source,
    worker: workerName,
    database: databaseName,
    domain,
    secretNames: Object.keys(secretPayload),
    step: 'verified',
  })
  log.ok('Deep Research migrations, Worker, Custom Domain, and runner secrets deployed.')
}
