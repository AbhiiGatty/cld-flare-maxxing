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
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { randomBytes } from 'node:crypto'
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
const providerSecretFile = join(DIRS.root, 'secrets', 'deep-research-provider.json')
const requiredSecrets = [
  'RUNNER_HMAC_SECRET',
  'RUNNER_ACCESS_CLIENT_ID',
  'RUNNER_ACCESS_CLIENT_SECRET',
  'PROVIDER_CREDENTIAL_KEY',
]

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
  || requiredSecrets.some((name) => !configText.includes(`"${name}"`))
) {
  log.err('Wrangler configuration is incomplete or does not match the requested Worker, D1, and domain')
  process.exit(1)
}

const credentials = JSON.parse(readFileSync(secretFile, 'utf8'))
const runnerSecrets = {
  RUNNER_HMAC_SECRET: credentials.runnerHmacSecret,
  RUNNER_ACCESS_CLIENT_ID: credentials.runnerAccessClientId,
  RUNNER_ACCESS_CLIENT_SECRET: credentials.runnerAccessClientSecret,
}
if (Object.values(runnerSecrets).some((value) => typeof value !== 'string' || !value)) {
  log.err('runner credential bundle is incomplete')
  process.exit(1)
}

function loadProviderKey() {
  if (!existsSync(providerSecretFile)) return null
  const bundle = JSON.parse(readFileSync(providerSecretFile, 'utf8'))
  const value = String(bundle.providerCredentialKey || '')
  if (!/^[A-Za-z0-9_-]{43}$/.test(value) || Buffer.from(value, 'base64url').byteLength !== 32) {
    throw new Error(`${providerSecretFile} is invalid; refusing to rotate or replace it`)
  }
  return value
}

function writeProviderKey(value) {
  mkdirSync(dirname(providerSecretFile), { recursive: true, mode: 0o700 })
  const temporary = `${providerSecretFile}.tmp`
  writeFileSync(temporary, JSON.stringify({
    providerCredentialKey: value,
    createdAt: new Date().toISOString(),
  }, null, 2), { encoding: 'utf8', mode: 0o600 })
  try {
    chmodSync(temporary, 0o600)
  } catch {
    // Windows ACLs are managed separately; the directory is gitignored.
  }
  renameSync(temporary, providerSecretFile)
}

let providerKey = loadProviderKey()

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
log.info(`Worker secrets: ${requiredSecrets.join(', ')}`)
log.info(`Provider encryption key: ${providerKey ? 'reuse existing' : 'create once on commit'}`)

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
    secretNames: requiredSecrets,
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
    secretNames: requiredSecrets,
  })
  if (!providerKey) {
    providerKey = randomBytes(32).toString('base64url')
    writeProviderKey(providerKey)
    log.ok('created the local provider encryption key')
  }
  const secretPayload = {
    ...runnerSecrets,
    PROVIDER_CREDENTIAL_KEY: providerKey,
  }
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
  run(
    'install required Worker secrets',
    process.execPath,
    [wranglerBin, 'secret', 'bulk', '--config', 'wrangler.jsonc'],
    mutationEnv,
    { input: JSON.stringify(secretPayload), suppressOutput: true },
  )
  run('deploy Worker and Custom Domain', process.execPath, [
    wranglerBin,
    'deploy',
    '--config',
    'wrangler.jsonc',
  ], mutationEnv)

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
  // Wrangler prints an "a newer version is available" notice before the
  // JSON payload, so parse from the first bracket rather than the first
  // byte. Without this the verification step throws on a healthy deploy.
  const jsonStart = secretListOutput.indexOf('[')
  if (jsonStart === -1) throw new Error('Worker secret list returned no JSON payload')
  const installedSecretNames = new Set(
    JSON.parse(secretListOutput.slice(jsonStart)).map((item) => String(item.name || '')),
  )
  const missingSecrets = requiredSecrets.filter((name) => !installedSecretNames.has(name))
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
    secretNames: requiredSecrets,
    step: 'verified',
  })
  log.ok('Deep Research migrations, secrets, Worker, and Custom Domain deployed.')
}
