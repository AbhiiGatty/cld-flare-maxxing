#!/usr/bin/env node
/**
 * Guarded action: deploy the static-assets-only DPDPA landing Worker.
 *
 * The live target is intentionally fixed. The action refuses a different
 * Worker name, Custom Domain, route shape, or executable Worker entry point.
 * DRY-RUN is the default. Add --commit only after the printed plan is approved.
 */
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
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

const EXPECTED_WORKER = 'gattyworks-dpdpa'
const EXPECTED_DOMAIN = 'dpdpa.gattyworks.com'
const EXPECTED_CONFIG = 'wrangler.jsonc'
const EXPECTED_ASSET_DIRECTORY = './site'
const ALLOWED_TOP_LEVEL_KEYS = new Set([
  '$schema',
  'name',
  'compatibility_date',
  'workers_dev',
  'preview_urls',
  'routes',
  'assets',
  'observability',
])
const ALLOWED_ASSET_KEYS = new Set([
  'directory',
  'html_handling',
  'not_found_handling',
])

function fail(message) {
  log.err(message)
  process.exit(1)
}

function parseJsonc(text) {
  let output = ''
  let quote = false
  let escape = false
  let lineComment = false
  let blockComment = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]
    if (lineComment) {
      if (char === '\n') {
        lineComment = false
        output += char
      }
      continue
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false
        index += 1
      }
      continue
    }
    if (quote) {
      output += char
      if (escape) escape = false
      else if (char === '\\') escape = true
      else if (char === '"') quote = false
      continue
    }
    if (char === '"') {
      quote = true
      output += char
    } else if (char === '/' && next === '/') {
      lineComment = true
      index += 1
    } else if (char === '/' && next === '*') {
      blockComment = true
      index += 1
    } else {
      output += char
    }
  }

  return JSON.parse(output.replace(/,\s*([}\]])/g, '$1'))
}

function assertNoSymlinks(directory) {
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      if (lstatSync(path).isSymbolicLink()) {
        throw new Error(`asset directory contains a symbolic link: ${path}`)
      }
      if (entry.isDirectory()) visit(path)
    }
  }
  visit(directory)
}

function validateSource(sourceInput, requestedWorker, requestedDomain) {
  if (!sourceInput || !isAbsolute(sourceInput)) {
    fail('usage: --source=<absolute-landing-path> [--worker=gattyworks-dpdpa] [--domain=dpdpa.gattyworks.com] [--commit]')
  }
  if (requestedWorker !== EXPECTED_WORKER || requestedDomain !== EXPECTED_DOMAIN) {
    fail(`this action is pinned to Worker ${EXPECTED_WORKER} and Custom Domain ${EXPECTED_DOMAIN}`)
  }

  const source = resolve(sourceInput)
  const configPath = join(source, EXPECTED_CONFIG)
  const packagePath = join(source, 'package.json')
  const lockPath = join(source, 'package-lock.json')
  if (!existsSync(configPath) || !existsSync(packagePath) || !existsSync(lockPath)) {
    fail(`source must contain ${EXPECTED_CONFIG}, package.json, and package-lock.json`)
  }

  let config
  let packageJson
  let lock
  try {
    config = parseJsonc(readFileSync(configPath, 'utf8'))
    packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))
    lock = JSON.parse(readFileSync(lockPath, 'utf8'))
  } catch (error) {
    fail(`source configuration could not be parsed: ${error.message}`)
  }

  const unexpectedTopLevel = Object.keys(config).filter((key) => !ALLOWED_TOP_LEVEL_KEYS.has(key))
  const routes = Array.isArray(config.routes) ? config.routes : []
  const route = routes[0]
  const assets = config.assets && typeof config.assets === 'object' ? config.assets : {}
  const unexpectedAssetKeys = Object.keys(assets).filter((key) => !ALLOWED_ASSET_KEYS.has(key))
  if (
    config.name !== EXPECTED_WORKER
    || config.workers_dev !== false
    || config.preview_urls !== false
    || routes.length !== 1
    || !route
    || Object.keys(route).sort().join(',') !== 'custom_domain,pattern'
    || route.pattern !== EXPECTED_DOMAIN
    || route.custom_domain !== true
    || assets.directory !== EXPECTED_ASSET_DIRECTORY
    || unexpectedTopLevel.length
    || unexpectedAssetKeys.length
    || 'main' in config
  ) {
    fail('Wrangler configuration is not the approved static-assets-only DPDPA Worker and Custom Domain target')
  }

  const assetDirectory = resolve(source, assets.directory)
  if (assetDirectory !== resolve(source, 'site') || !existsSync(join(assetDirectory, 'index.html'))) {
    fail('the approved site asset directory or its index.html is missing')
  }
  try {
    assertNoSymlinks(assetDirectory)
  } catch (error) {
    fail(error.message)
  }

  const lockedWrangler = lock.packages?.['node_modules/wrangler']?.version
  if (
    packageJson.scripts?.check !== 'npm run deploy:dry'
    || packageJson.scripts?.['deploy:dry'] !== 'wrangler deploy --dry-run --outdir .dry-run'
    || typeof lockedWrangler !== 'string'
    || !/^\d+\.\d+\.\d+(?:-.+)?$/.test(lockedWrangler)
  ) {
    fail('the source must provide the approved dry-run check and a Wrangler version pinned by package-lock.json')
  }

  return { source, configPath, assetDirectory, lockedWrangler }
}

function run(label, command, commandArgs, cwd, env) {
  log.info(label)
  const result = spawnSync(command, commandArgs, {
    cwd,
    env,
    encoding: 'utf8',
  })
  const output = `${result.stdout || ''}${result.stderr || ''}`
  if (output.trim()) process.stdout.write(output.endsWith('\n') ? output : `${output}\n`)
  if (result.error || result.status !== 0) {
    audit({
      action: 'dpdpa-landing-deploy',
      status: 'FAILED',
      step: label,
      error: result.error?.message,
      code: result.status,
    })
    throw new Error(`${label} failed with exit code ${result.status ?? 1}`)
  }
}

async function main() {
  const rawArgs = process.argv.slice(2)
  const allowedArgs = new Set(['source', 'worker', 'domain', 'commit'])
  const seenArgs = new Set()
  for (const rawArg of rawArgs) {
    const key = rawArg.startsWith('--') ? rawArg.slice(2).split('=')[0] : ''
    const shapedCorrectly = key === 'commit'
      ? rawArg === '--commit'
      : rawArg.startsWith(`--${key}=`) && rawArg.length > key.length + 3
    if (!allowedArgs.has(key) || seenArgs.has(key) || !shapedCorrectly) {
      fail('usage: --source=<absolute-landing-path> [--worker=gattyworks-dpdpa] [--domain=dpdpa.gattyworks.com] [--commit]')
    }
    seenArgs.add(key)
  }
  const { args, pos, commit } = parseArgs(rawArgs)
  if (pos.length) {
    fail('usage: --source=<absolute-landing-path> [--worker=gattyworks-dpdpa] [--domain=dpdpa.gattyworks.com] [--commit]')
  }
  const action = 'dpdpa-landing-deploy'
  const requestedWorker = String(args.worker || EXPECTED_WORKER)
  const requestedDomain = String(args.domain || EXPECTED_DOMAIN).toLowerCase()
  const { source, configPath, assetDirectory, lockedWrangler } = validateSource(
    String(args.source || ''),
    requestedWorker,
    requestedDomain,
  )

  log.info(`source: ${source}`)
  log.info(`Worker: ${EXPECTED_WORKER}`)
  log.info(`Custom Domain: ${EXPECTED_DOMAIN}`)
  log.info(`assets: ${assetDirectory}`)
  log.info(`pinned Wrangler: ${lockedWrangler}`)
  log.info('scope: static assets only; workers.dev and preview URLs stay disabled')

  if (!commit) {
    log.warn('DRY-RUN - local target validation passed; nothing deployed and nothing mutated.')
    log.warn('On an approved --commit run, locked dependencies and the Wrangler dry run finish before break-glass loads the edit token.')
    audit({
      action,
      status: 'DRY_RUN',
      source,
      worker: EXPECTED_WORKER,
      domain: EXPECTED_DOMAIN,
      config: configPath,
      assets: assetDirectory,
      wranglerVersion: lockedWrangler,
    }, { required: true })
    return
  }

  const buildEnv = commandEnv()
  const npmCommand = process.platform === 'win32' ? process.execPath : npmExecutable()
  const npmCli = process.platform === 'win32'
    ? join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
    : null
  if (npmCli && !existsSync(npmCli)) throw new Error(`Pinned npm CLI is missing at ${npmCli}`)
  const npmArgs = (commandArgs) => npmCli ? [npmCli, ...commandArgs] : commandArgs

  run('install locked DPDPA landing dependencies', npmCommand, npmArgs(['ci']), source, buildEnv)
  const installedWrangler = JSON.parse(
    readFileSync(join(source, 'node_modules', 'wrangler', 'package.json'), 'utf8'),
  ).version
  if (installedWrangler !== lockedWrangler) {
    throw new Error(`installed Wrangler ${installedWrangler} does not match lockfile ${lockedWrangler}`)
  }
  run('run DPDPA landing Wrangler dry run', npmCommand, npmArgs(['run', 'check']), source, buildEnv)

  const cf = bootEdit(action, {
    source,
    worker: EXPECTED_WORKER,
    domain: EXPECTED_DOMAIN,
    assets: assetDirectory,
  })
  const accountId = await resolveAccountId(cf)
  const mutationEnv = commandEnv({
    CLOUDFLARE_API_TOKEN: cf.token,
    CLOUDFLARE_ACCOUNT_ID: accountId,
  })
  const wranglerBin = wranglerExecutable(source)

  run('deploy static assets Worker and Custom Domain', process.execPath, [
    wranglerBin,
    'deploy',
    '--config',
    EXPECTED_CONFIG,
  ], source, mutationEnv)

  const service = await cf.get(
    `/accounts/${accountId}/workers/services/${encodeURIComponent(EXPECTED_WORKER)}`,
  )
  if (!service) {
    audit({ action, status: 'FAILED', worker: EXPECTED_WORKER, domain: EXPECTED_DOMAIN, step: 'verify Worker service' })
    throw new Error('Worker service verification failed')
  }

  audit({
    action,
    status: 'COMMITTED',
    source,
    worker: EXPECTED_WORKER,
    domain: EXPECTED_DOMAIN,
    assets: assetDirectory,
    wranglerVersion: lockedWrangler,
    step: 'verified',
  })
  log.ok(`deployed ${EXPECTED_WORKER} at ${EXPECTED_DOMAIN}`)
}

await main()
