#!/usr/bin/env node
/** Guarded action: deploy the fixed GattyWorks Metrics Worker. */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { existsSync, lstatSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolveAccountId } from '../lib/cf.mjs'
import {
  audit,
  bootEdit,
  commandEnv,
  log,
  npmExecutable,
  parseArgs,
  wranglerExecutable,
} from './_lib.mjs'

const action = 'gattyworks-metrics-deploy'
const actionDirectory = dirname(fileURLToPath(import.meta.url))
const maxxingRoot = resolve(actionDirectory, '..', '..')
const EXPECTED_SOURCE = resolve(maxxingRoot, '..', 'gattyworks-metrics')
const EXPECTED_WORKER = 'gattyworks-metrics'
const EXPECTED_DOMAIN = 'metrics.gattyworks.com'
const EXPECTED_DATABASE = 'gattyworks-metrics'
const APPROVED_FILES = Object.freeze({
  'package.json': '3191c609cd4334f68c283d9b6e1759dd7b05621c266984bf9c636911ae7a65a1',
  'package-lock.json': 'ae882a6bbb1b9a7c79bbd4872e59b5bb81a64edf21e0e48643a42e2ff93fed1d',
  'tsconfig.json': '4fbb61d1cc39d5dcdb79932234c9e0ba1f62ba19d5d6f36fe5836ef110d292db',
  'wrangler.jsonc': '87b2f74a1d27b41c7fb20c425e150da06c7638d0da2880445f0cd6fdd8cde8c1',
  'src/index.ts': '80927f56df3fb46f0bc4547e266b1054eb0e47ee34160369639806a968794518',
  'src/mcp.ts': '69e2ba6e2ced5ed45dbb3489c8993a3759161045dc7fbba513eb67c5b120238b',
  'dashboard/attribution.js.snippet': 'a92f4310e645cab6d0e595f7f69e5d57f1f118eba429d161fa18447e2f2f9488',
  'dashboard/beacon.js': '7e3e9ccab30d8fe6ab77b49d1118d43f60a4d5ce80d88c01e655853c70c7bf59',
  'dashboard/design.html': 'bcd1c3ebe1d011339998be706654b4629f1e1d519b30a595ebd5e41f60cefca6',
  'dashboard/favicon.svg': '6609d4116febf85df64fd8e77fe8bb457463f79bbf2c2811a1381ea890a495e4',
  'dashboard/index.html': '7596106db6805cf4feb5046b4f4160a97452deb36cdb6ccd11d24c5f06a8ad31',
  'dashboard/landing.css': '79245c0703997f431d34ee47930feab6360f360c391d0a687bccdb51f86eb609',
  'dashboard/landing.html': 'b4cccef7d3cae614f4bf7bde78b774558ffefed72afbd449eaf67ff8f6bba149',
  'dashboard/landing.js': 'd4de648cefae88b9e5101227d91f73bc13fd76fda936d4341af5feb610f9be58',
  'dashboard/mark-eye-muted.svg': 'ad02ec6d47d378cb0aa77a0d7ce9b3aa7f617a5cd106372754e2f93a84ea61a5',
  'dashboard/mark-eye-wordmark-muted.svg': '117db70c2c39206f983d668b344a387d3d7c457515d0b6ac2629ca2b00a96df2',
  'dashboard/mark-eye.svg': '8223f87ded2988e703270e23d68d44ac7350ac8746f8f39fa71eb06a62bae135',
})

function fail(message) {
  throw new Error(message)
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function validateSource() {
  if (!existsSync(EXPECTED_SOURCE) || lstatSync(EXPECTED_SOURCE).isSymbolicLink()) {
    fail(`expected sibling Metrics repository is missing or linked: ${EXPECTED_SOURCE}`)
  }
  for (const [relativePath, approvedHash] of Object.entries(APPROVED_FILES)) {
    const path = join(EXPECTED_SOURCE, relativePath)
    if (!existsSync(path) || lstatSync(path).isSymbolicLink()) {
      fail(`approved Metrics deployment file is missing or linked: ${relativePath}`)
    }
    if (sha256(path) !== approvedHash) fail(`approved Metrics deployment fingerprint changed: ${relativePath}`)
  }

  const packageJson = JSON.parse(readFileSync(join(EXPECTED_SOURCE, 'package.json'), 'utf8'))
  const lock = JSON.parse(readFileSync(join(EXPECTED_SOURCE, 'package-lock.json'), 'utf8'))
  const config = readFileSync(join(EXPECTED_SOURCE, 'wrangler.jsonc'), 'utf8')
  const lockedWrangler = lock.packages?.['node_modules/wrangler']?.version
  if (
    packageJson.name !== EXPECTED_WORKER
    || packageJson.scripts?.typecheck !== 'tsc --noEmit'
    || typeof lockedWrangler !== 'string'
    || !config.includes(`"name": "${EXPECTED_WORKER}"`)
    || !config.includes(`"pattern": "${EXPECTED_DOMAIN}"`)
    || !config.includes(`"database_name": "${EXPECTED_DATABASE}"`)
    || !config.includes('"directory": "./dashboard"')
    || !config.includes('"run_worker_first": true')
  ) {
    fail('Metrics repository is not the approved fixed Worker deployment source')
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
    fail('usage: node scripts/actions/gattyworks-metrics-deploy.mjs [--commit]')
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

async function verifyLocalOrigin() {
  const origin = 'http://127.0.0.1:4322'
  const response = await fetch(`https://${EXPECTED_DOMAIN}/api/event`, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  })
  if (response.status !== 204 || response.headers.get('Access-Control-Allow-Origin') !== origin) {
    fail('fresh Metrics deployment did not allow the fixed Jan Aushadhi local origin')
  }
}

async function main() {
  const { commit } = parseCommandLine()
  let approved = validateSource()
  log.info(`source: ${EXPECTED_SOURCE}`)
  log.info(`Worker: ${EXPECTED_WORKER}`)
  log.info(`Custom Domain: ${EXPECTED_DOMAIN}`)
  log.info(`D1 database: ${EXPECTED_DATABASE}`)
  log.info(`pinned Wrangler: ${approved.lockedWrangler}`)

  const auditDetails = {
    source: EXPECTED_SOURCE,
    worker: EXPECTED_WORKER,
    domain: EXPECTED_DOMAIN,
    database: EXPECTED_DATABASE,
    wranglerVersion: approved.lockedWrangler,
  }
  const buildEnv = commandEnv()
  const npmCommand = process.platform === 'win32' ? process.execPath : npmExecutable()
  const npmCli = process.platform === 'win32'
    ? join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
    : null
  if (npmCli && !existsSync(npmCli)) fail(`pinned npm CLI is missing at ${npmCli}`)
  const npmArgs = (args) => npmCli ? [npmCli, ...args] : args

  run('install locked GattyWorks Metrics dependencies', npmCommand, npmArgs(['ci']), buildEnv)
  run('typecheck GattyWorks Metrics', npmCommand, npmArgs(['run', 'typecheck']), buildEnv)
  approved = validateSource()
  const executable = wranglerExecutable(EXPECTED_SOURCE)
  const installed = JSON.parse(
    readFileSync(join(EXPECTED_SOURCE, 'node_modules', 'wrangler', 'package.json'), 'utf8'),
  ).version
  if (installed !== approved.lockedWrangler) fail(`installed Wrangler ${installed} does not match lockfile ${approved.lockedWrangler}`)
  run('run pinned GattyWorks Metrics deploy dry run', process.execPath, [executable, 'deploy', '--dry-run'], buildEnv)

  if (!commit) {
    log.warn('DRY-RUN: would deploy the exact pinned Metrics Worker and dashboard assets to the fixed Custom Domain.')
    audit({ action, status: 'DRY_RUN', ...auditDetails }, { required: true })
    return
  }

  const cf = bootEdit(action, auditDetails)
  const accountId = await resolveAccountId(cf)
  const mutationEnv = commandEnv({
    CLOUDFLARE_API_TOKEN: cf.token,
    CLOUDFLARE_ACCOUNT_ID: accountId,
    NO_UPDATE_NOTIFIER: '1',
  })
  validateSource()
  run(
    'deploy fixed GattyWorks Metrics Worker',
    process.execPath,
    [executable, 'deploy', '--message', 'Allow Jan Aushadhi local metrics verification'],
    mutationEnv,
  )
  await verifyLocalOrigin()
  audit({ action, status: 'COMMITTED', ...auditDetails, verifiedOrigin: 'http://127.0.0.1:4322' })
  log.ok('Deployed the fixed GattyWorks Metrics Worker and verified the Jan Aushadhi local origin.')
}

try {
  await main()
} catch (error) {
  audit({ action, status: 'FAILED', reason: error instanceof Error ? error.message : 'unknown error' })
  log.err(error instanceof Error ? error.message : 'unknown error')
  process.exitCode = 1
}
