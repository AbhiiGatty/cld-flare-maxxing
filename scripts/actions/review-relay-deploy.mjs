#!/usr/bin/env node
/**
 * Guarded action: deploy Review Relay and connect Turnstile.
 *
 * Applies D1 migrations, deploys the Worker and Custom Domain, creates or
 * reuses a managed Turnstile widget, and installs the Turnstile and IP-hash
 * secrets directly through Wrangler stdin. Secret values are never logged or
 * written to disk.
 *
 * DRY-RUN by default. Add --commit to mutate the account.
 */
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { makeClient, resolveAccountId } from '../lib/cf.mjs'
import { DIRS } from '../lib/paths.mjs'
import { loadEnv } from '../lib/util.mjs'
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
const action = 'review-relay-deploy'
const sourceInput = String(args.source || '')
const workerName = String(args.worker || '')
const databaseName = String(args.database || '')
const domain = String(args.domain || '').toLowerCase()
const hostname = String(args.hostname || '').toLowerCase()
const widgetName = String(args.widget || '')

if (
  !sourceInput
  || !isAbsolute(sourceInput)
  || !workerName
  || !databaseName
  || !domain
  || !hostname
  || !widgetName
) {
  log.err(
    'usage: --source=<absolute-repo-path> --worker=<worker-name> --database=<d1-name> '
    + '--domain=<custom-domain> --hostname=<turnstile-hostname> --widget=<widget-name> [--commit]',
  )
  process.exit(1)
}

if (
  !/^[a-z0-9-]+$/.test(workerName)
  || !/^[a-z0-9-]+$/.test(databaseName)
  || !/^[a-z0-9.-]+$/.test(domain)
  || !/^[a-z0-9.-]+$/.test(hostname)
  || !domain.includes('.')
  || !hostname.includes('.')
) {
  log.err('worker, database, domain, or hostname argument is invalid')
  process.exit(1)
}

const source = resolve(sourceInput)
const workerDir = join(source, 'workers', 'review-relay')
const config = join(workerDir, 'wrangler.jsonc')
const packageFile = join(workerDir, 'package.json')

if (!existsSync(config) || !existsSync(packageFile)) {
  log.err('source does not contain workers/review-relay configuration')
  process.exit(1)
}

const configText = readFileSync(config, 'utf8')
if (
  configText.includes('00000000-0000-0000-0000-000000000000')
  || !configText.includes(domain)
  || !configText.includes(workerName)
  || !configText.includes(databaseName)
) {
  log.err('Review Relay Wrangler configuration is incomplete or does not match the requested resources')
  process.exit(1)
}

loadEnv(DIRS.env)
const read = makeClient({ mode: 'read' })
const accountId = await resolveAccountId(read)

async function accountState(client) {
  const [databases, services, widgets] = await Promise.all([
    client.getAll(`/accounts/${accountId}/d1/database`, { query: { per_page: 100 } }),
    client.getAll(`/accounts/${accountId}/workers/services`, { query: { per_page: 100 } }),
    client.getAll(`/accounts/${accountId}/challenges/widgets`, { query: { per_page: 100 } }),
  ])
  return {
    database: databases.find((item) => item.name === databaseName) || null,
    worker: services.find(
      (item) => item.default_environment?.script?.name === workerName || item.id === workerName,
    ) || null,
    widget: widgets.find((item) => String(item.name || '') === widgetName) || null,
  }
}

const before = await accountState(read)
if (!before.database?.uuid) {
  log.err(`D1 database ${databaseName} does not exist. Run review-relay-provision.mjs first.`)
  process.exit(1)
}

log.info(`source: ${source}`)
log.info(`Worker ${workerName}: ${before.worker ? 'update' : 'create'}`)
log.info(`D1 migrations: apply pending migrations to ${databaseName}`)
log.info(`Custom Domain: ${domain}`)
log.info(`Turnstile widget: ${widgetName} for ${hostname} ${before.widget ? '(reuse)' : '(create)'}`)
log.info('TURNSTILE_SECRET_KEY and a fresh IP_HASH_SECRET will be installed without logging their values.')

if (!commit) {
  log.warn('DRY-RUN - nothing changed. Re-run with --commit to apply.')
  audit({
    action,
    status: 'DRY_RUN',
    source,
    workerName,
    databaseName,
    domain,
    hostname,
    widgetName,
    workerExists: Boolean(before.worker),
    widgetExists: Boolean(before.widget),
  })
  process.exit(0)
}

function run(label, command, commandArgs, env, input) {
  log.info(label)
  const result = spawnSync(command, commandArgs, {
    cwd: workerDir,
    env,
    input,
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

const buildEnv = commandEnv()
run('install locked Review Relay dependencies', npmExecutable(), ['ci'], buildEnv)
run('verify Review Relay Worker', npmExecutable(), ['run', 'check'], buildEnv)

const cf = bootEdit(action, {
  source,
  worker: workerName,
  database: databaseName,
  domain,
  hostname,
  widget: widgetName,
})
const mutationEnv = commandEnv({
  CLOUDFLARE_API_TOKEN: cf.token,
  CLOUDFLARE_ACCOUNT_ID: accountId,
})
const wranglerBin = wranglerExecutable(workerDir)

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

let widget = before.widget
if (!widget) {
  const response = await cf.raw('POST', `/accounts/${accountId}/challenges/widgets`, {
    body: {
      name: widgetName,
      domains: [hostname],
      mode: 'managed',
      clearance_level: 'no_clearance',
      region: 'world',
    },
  })
  widget = response.result
  audit({
    action,
    status: 'COMMITTED',
    step: 'create-turnstile',
    widgetName,
    hostname,
    sitekey: widget?.sitekey,
  })
  log.ok(`created Turnstile widget ${widgetName}`)
}

if (widget?.sitekey && !widget.secret) {
  widget = await cf.get(
    `/accounts/${accountId}/challenges/widgets/${encodeURIComponent(widget.sitekey)}`,
  )
}
if (!widget?.sitekey || !widget.secret) {
  audit({ action, status: 'FAILED', step: 'read-turnstile-secret', widgetName })
  throw new Error('Turnstile widget verification did not return an installable secret.')
}

run(
  'install TURNSTILE_SECRET_KEY',
  process.execPath,
  [wranglerBin, 'secret', 'put', 'TURNSTILE_SECRET_KEY', '--config', 'wrangler.jsonc'],
  mutationEnv,
  `${widget.secret}\n`,
)
run(
  'install IP_HASH_SECRET',
  process.execPath,
  [wranglerBin, 'secret', 'put', 'IP_HASH_SECRET', '--config', 'wrangler.jsonc'],
  mutationEnv,
  `${randomBytes(32).toString('base64url')}\n`,
)

const after = await accountState(cf)
if (!after.worker || !after.database?.uuid || !after.widget?.sitekey) {
  audit({ action, status: 'FAILED', step: 'verify', workerName, databaseName, widgetName })
  throw new Error('Review Relay deployment verification failed.')
}

audit({
  action,
  status: 'COMMITTED',
  step: 'verified',
  workerName,
  databaseName,
  domain,
  hostname,
  widgetName,
  sitekey: after.widget.sitekey,
})
log.ok('Review Relay Worker, D1 migrations, Custom Domain, Turnstile, and secrets verified.')
console.log(JSON.stringify({
  workerName,
  databaseName,
  domain,
  hostname,
  turnstileSitekey: after.widget.sitekey,
}, null, 2))
