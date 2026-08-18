#!/usr/bin/env node
/** Guarded action: build, deploy, and verify the fixed Jan Aushadhi Worker. */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { dirname, join, relative, resolve } from 'node:path'
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolveAccountId } from '../lib/cf.mjs'
import {
  audit,
  bootEdit,
  bootRead,
  commandEnv,
  log,
  npmExecutable,
  parseArgs,
  wranglerExecutable,
} from './_lib.mjs'

const action = 'jan-aushadhi-deploy'
const actionDirectory = dirname(fileURLToPath(import.meta.url))
const maxxingRoot = resolve(actionDirectory, '..', '..')
const EXPECTED_SOURCE = resolve(maxxingRoot, '..', 'jan-aushadhi-finder')
const EXPECTED_WORKER = 'jan-aushadhi-finder'
const EXPECTED_DATABASE = 'jan-aushadhi-subscribers'
const EXPECTED_KV_ID = '53ec6f9d438c4c2ab927d2f33920e64a'
const EXPECTED_WIDGET_NAME = 'jan-aushadhi-price-watch'
const EXPECTED_DOMAINS = Object.freeze([
  'india-aushadi.gattyworks.com',
  'aushadhi.gattyworks.com',
])
const SOURCE_ROOTS = Object.freeze([
  'src', 'functions', 'worker', 'public', 'migrations', 'scripts', 'design',
])
const SOURCE_FILES = Object.freeze([
  'package.json', 'package-lock.json', 'astro.config.mjs', 'tsconfig.json',
  'wrangler.toml', 'schema.sql',
])
const EXCLUDED_GENERATED = 'public/data/version.json'
const APPROVED_SOURCE_COUNT = 148
const APPROVED_SOURCE_HASH = '525f72391a95a38f01b648b8584d6ad4320ca7544383a5bb0134ef9e1dc1754d'

function fail(message) {
  throw new Error(message)
}

function collectFiles(directory, output) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (lstatSync(path).isSymbolicLink()) fail(`linked deployment input is not allowed: ${path}`)
    if (entry.isDirectory()) collectFiles(path, output)
    else if (entry.isFile()) output.push(relative(EXPECTED_SOURCE, path).replaceAll('\\', '/'))
  }
}

function sourceFingerprint() {
  const files = [...SOURCE_FILES]
  for (const directory of SOURCE_ROOTS) {
    const path = join(EXPECTED_SOURCE, directory)
    if (!existsSync(path) || lstatSync(path).isSymbolicLink()) {
      fail(`approved deployment source directory is missing or linked: ${directory}`)
    }
    collectFiles(path, files)
  }
  const selected = [...new Set(files)]
    .filter((file) => file !== EXCLUDED_GENERATED)
    .sort()
  const hash = createHash('sha256')
  for (const file of selected) {
    const path = join(EXPECTED_SOURCE, file)
    if (!existsSync(path) || lstatSync(path).isSymbolicLink()) {
      fail(`approved deployment source file is missing or linked: ${file}`)
    }
    hash.update(file)
    hash.update('\0')
    hash.update(readFileSync(path))
    hash.update('\0')
  }
  return { count: selected.length, hash: hash.digest('hex') }
}

function validateSource() {
  if (!existsSync(EXPECTED_SOURCE) || lstatSync(EXPECTED_SOURCE).isSymbolicLink()) {
    fail(`expected sibling Jan Aushadhi repository is missing or linked: ${EXPECTED_SOURCE}`)
  }
  const fingerprint = sourceFingerprint()
  if (fingerprint.count !== APPROVED_SOURCE_COUNT || fingerprint.hash !== APPROVED_SOURCE_HASH) {
    fail(`approved Jan Aushadhi deployment source fingerprint changed: ${fingerprint.count}/${fingerprint.hash}`)
  }
  const packageJson = JSON.parse(readFileSync(join(EXPECTED_SOURCE, 'package.json'), 'utf8'))
  const lock = JSON.parse(readFileSync(join(EXPECTED_SOURCE, 'package-lock.json'), 'utf8'))
  const config = readFileSync(join(EXPECTED_SOURCE, 'wrangler.toml'), 'utf8')
  const lockedWrangler = lock.packages?.['node_modules/wrangler']?.version
  if (
    packageJson.name !== 'india-jan-aushadhi-dost'
    || typeof lockedWrangler !== 'string'
    || !config.includes(`name = "${EXPECTED_WORKER}"`)
    || !config.includes(`database_name = "${EXPECTED_DATABASE}"`)
    || !config.includes(`id = "${EXPECTED_KV_ID}"`)
    || !config.includes('directory = "./dist"')
    || !EXPECTED_DOMAINS.every((domain) => config.includes(`pattern = "${domain}"`))
  ) {
    fail('Jan Aushadhi repository is not the approved fixed Worker source')
  }
  return { lockedWrangler }
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
    fail('usage: node scripts/actions/jan-aushadhi-deploy.mjs [--commit]')
  }
  return { commit }
}

function run(label, command, args, env) {
  log.info(label)
  const result = spawnSync(command, args, {
    cwd: EXPECTED_SOURCE,
    env,
    encoding: 'utf8',
  })
  if (result.error || result.status !== 0) {
    audit({ action, status: 'FAILED', step: label, code: result.status, signal: result.signal })
    fail(`${label} failed with exit code ${result.status ?? 1}; child output was withheld`)
  }
}

function assertWidget(widget) {
  if (
    !widget
    || widget.name !== EXPECTED_WIDGET_NAME
    || typeof widget.sitekey !== 'string'
    || !Array.isArray(widget.domains)
    || widget.domains.length !== EXPECTED_DOMAINS.length
    || !EXPECTED_DOMAINS.every((domain) => widget.domains.includes(domain))
  ) {
    fail('the fixed Jan Aushadhi Turnstile widget is missing or changed')
  }
  return widget.sitekey
}

async function readSitekey(cf, accountId) {
  const widgets = await cf.getAll(`/accounts/${accountId}/challenges/widgets`, {
    query: { per_page: 50 },
  })
  const matches = widgets.filter((widget) => widget?.name === EXPECTED_WIDGET_NAME)
  if (matches.length !== 1) fail('expected exactly one fixed Jan Aushadhi Turnstile widget')
  return assertWidget(matches[0])
}

function verifyBuild(sitekey) {
  const html = readFileSync(join(EXPECTED_SOURCE, 'dist', 'index.html'), 'utf8')
  if (
    !html.includes(sitekey)
    || !html.includes('cf-turnstile')
    || !html.includes('price-watch follow-up')
    || html.includes('Price alerts are temporarily unavailable')
  ) {
    fail('production build does not contain the active manual price-watch form')
  }
}

async function verifyLive(sitekey) {
  for (const domain of EXPECTED_DOMAINS) {
    let verified = false
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await fetch(`https://${domain}/?release-check=${Date.now()}`, {
        headers: { 'Cache-Control': 'no-cache' },
      })
      const html = await response.text()
      verified = response.status === 200
        && html.includes(sitekey)
        && html.includes('cf-turnstile')
        && html.includes('price-watch follow-up')
        && !html.includes('Price alerts are temporarily unavailable')
      if (verified) break
      await new Promise((resolveWait) => setTimeout(resolveWait, 2000))
    }
    if (!verified) fail(`fresh Jan Aushadhi deployment did not verify on ${domain}`)
  }
}

async function main() {
  const { commit } = parseCommandLine()
  let approved = validateSource()
  const read = bootRead()
  const readAccountId = await resolveAccountId(read)
  const sitekey = await readSitekey(read, readAccountId)

  log.info(`source: ${EXPECTED_SOURCE}`)
  log.info(`Worker: ${EXPECTED_WORKER}`)
  log.info(`domains: ${EXPECTED_DOMAINS.join(', ')}`)
  log.info(`D1 database: ${EXPECTED_DATABASE}`)
  log.info(`pinned Wrangler: ${approved.lockedWrangler}`)

  const auditDetails = {
    source: EXPECTED_SOURCE,
    worker: EXPECTED_WORKER,
    domains: EXPECTED_DOMAINS,
    database: EXPECTED_DATABASE,
    sourceHash: APPROVED_SOURCE_HASH,
    wranglerVersion: approved.lockedWrangler,
  }
  const buildEnv = commandEnv({
    PUBLIC_TURNSTILE_SITE_KEY: sitekey,
    NODE_ENV: 'production',
  })
  const installEnv = commandEnv()
  const npmCommand = process.platform === 'win32' ? process.execPath : npmExecutable()
  const npmCli = process.platform === 'win32'
    ? join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
    : null
  if (npmCli && !existsSync(npmCli)) fail(`pinned npm CLI is missing at ${npmCli}`)
  const npmArgs = (args) => npmCli ? [npmCli, ...args] : args

  run('install locked Jan Aushadhi dependencies', npmCommand, npmArgs(['ci']), installEnv)
  run('verify and build Jan Aushadhi with the production Turnstile site key', npmCommand, npmArgs(['run', 'verify']), buildEnv)
  verifyBuild(sitekey)
  approved = validateSource()
  const executable = wranglerExecutable(EXPECTED_SOURCE)
  const installed = JSON.parse(
    readFileSync(join(EXPECTED_SOURCE, 'node_modules', 'wrangler', 'package.json'), 'utf8'),
  ).version
  if (installed !== approved.lockedWrangler) fail(`installed Wrangler ${installed} does not match lockfile ${approved.lockedWrangler}`)
  run('run pinned Jan Aushadhi deploy dry run', process.execPath, [executable, 'deploy', '--dry-run'], buildEnv)

  if (!commit) {
    log.warn('DRY-RUN: would deploy the exact verified Jan Aushadhi Worker and assets to both fixed domains.')
    audit({ action, status: 'DRY_RUN', ...auditDetails }, { required: true })
    return
  }

  const cf = bootEdit(action, auditDetails)
  const editAccountId = await resolveAccountId(cf)
  if (editAccountId !== readAccountId) fail('read and edit tokens resolved to different Cloudflare accounts')
  if (await readSitekey(cf, editAccountId) !== sitekey) fail('Turnstile widget changed after build preflight')
  validateSource()
  const mutationEnv = commandEnv({
    CLOUDFLARE_API_TOKEN: cf.token,
    CLOUDFLARE_ACCOUNT_ID: editAccountId,
    NO_UPDATE_NOTIFIER: '1',
  })
  run(
    'deploy fixed Jan Aushadhi Worker',
    process.execPath,
    [executable, 'deploy', '--message', 'Manual price watch contacts and production launch'],
    mutationEnv,
  )
  await verifyLive(sitekey)
  audit({ action, status: 'COMMITTED', ...auditDetails, verifiedDomains: EXPECTED_DOMAINS })
  log.ok('Deployed and verified the fixed Jan Aushadhi Worker on both live domains.')
}

try {
  await main()
} catch (error) {
  audit({ action, status: 'FAILED', reason: error instanceof Error ? error.message : 'unknown error' })
  log.err(error instanceof Error ? error.message : 'unknown error')
  process.exitCode = 1
}
