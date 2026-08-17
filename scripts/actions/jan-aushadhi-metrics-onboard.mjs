#!/usr/bin/env node
/**
 * Guarded action: register the two Jan Aushadhi origins with GattyWorks Metrics.
 *
 * This is a repository-only, fixed-scope release action. It accepts no target
 * arguments: the sibling Metrics repository, D1 database, projects, origins,
 * display names, and seeded GattyWorks owner are all pinned and validated.
 * DRY-RUN is the default. Add --commit only after the printed plan is approved.
 *
 * The pinned onboard.mjs also adds each origin's hostname to the shared
 * Metrics Turnstile widget via the edit token. The edit token must include
 * Account:Turnstile:Edit, or the action fails here instead of a later 403 on
 * the site's contact form.
 */
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
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

const action = 'jan-aushadhi-metrics-onboard'
const actionDirectory = dirname(fileURLToPath(import.meta.url))
const maxxingRoot = resolve(actionDirectory, '..', '..')
const EXPECTED_SOURCE = resolve(maxxingRoot, '..', 'gattyworks-metrics')
const EXPECTED_DATABASE = 'gattyworks-metrics'
const PROJECTS = Object.freeze([
  Object.freeze({
    id: 'jan-aushadhi-dost',
    name: 'Jan Aushadhi Dost',
    origin: 'https://india-aushadi.gattyworks.com',
  }),
  Object.freeze({
    id: 'jan-aushadhi-dost-alias',
    name: 'Jan Aushadhi Dost alias',
    origin: 'https://aushadhi.gattyworks.com',
  }),
])
const APPROVED_FILES = Object.freeze({
  'package.json': '3191c609cd4334f68c283d9b6e1759dd7b05621c266984bf9c636911ae7a65a1',
  'package-lock.json': 'ae882a6bbb1b9a7c79bbd4872e59b5bb81a64edf21e0e48643a42e2ff93fed1d',
  'schema.sql': 'abbcfe2deb3ef4cdb4652fc295d4a5f988c9b9cc5850f34435088554fa8fdca3',
  'scripts/onboard.mjs': '4a839a95f6e2d4476cc086336afe1f4b1eef98f9772d0b6b6d2002a918e34d9e',
  'wrangler.jsonc': '87b2f74a1d27b41c7fb20c425e150da06c7638d0da2880445f0cd6fdd8cde8c1',
})

function fail(message) {
  log.err(message)
  process.exit(1)
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function ownerFromApprovedSchema(schemaText) {
  const seededAdmins = [...schemaText.matchAll(
    /\('([^'\s]+@[^'\s]+)',\s*'admin',\s*'seed'\)/g,
  )].map((match) => match[1].toLowerCase())
  const GattyWorksOwners = seededAdmins.filter((email) => email.endsWith('@gattyworks.com'))
  if (GattyWorksOwners.length !== 1) {
    throw new Error('approved schema must contain exactly one seeded GattyWorks admin owner')
  }
  return GattyWorksOwners[0]
}

function validateSource() {
  if (!existsSync(EXPECTED_SOURCE) || lstatSync(EXPECTED_SOURCE).isSymbolicLink()) {
    throw new Error(`expected sibling Metrics repository is missing or linked: ${EXPECTED_SOURCE}`)
  }

  for (const [relativePath, approvedHash] of Object.entries(APPROVED_FILES)) {
    const path = join(EXPECTED_SOURCE, relativePath)
    if (!existsSync(path) || lstatSync(path).isSymbolicLink()) {
      throw new Error(`approved Metrics source file is missing or linked: ${relativePath}`)
    }
    if (sha256(path) !== approvedHash) {
      throw new Error(`approved Metrics source fingerprint changed: ${relativePath}`)
    }
  }

  const packageJson = JSON.parse(readFileSync(join(EXPECTED_SOURCE, 'package.json'), 'utf8'))
  const lock = JSON.parse(readFileSync(join(EXPECTED_SOURCE, 'package-lock.json'), 'utf8'))
  const configText = readFileSync(join(EXPECTED_SOURCE, 'wrangler.jsonc'), 'utf8')
  const schemaText = readFileSync(join(EXPECTED_SOURCE, 'schema.sql'), 'utf8')
  const lockedWrangler = lock.packages?.['node_modules/wrangler']

  if (
    packageJson.name !== 'gattyworks-metrics'
    || packageJson.scripts?.typecheck !== 'tsc --noEmit'
    || Object.keys(packageJson.scripts || {}).some((name) => (
      ['preinstall', 'install', 'postinstall', 'prepare'].includes(name)
    ))
    || typeof lockedWrangler?.version !== 'string'
    || lockedWrangler.resolved !== `https://registry.npmjs.org/wrangler/-/wrangler-${lockedWrangler.version}.tgz`
    || !/^sha512-[A-Za-z0-9+/=]+$/.test(String(lockedWrangler.integrity || ''))
    || !configText.includes(`\"database_name\": \"${EXPECTED_DATABASE}\"`)
    || !configText.includes(`\"name\": \"${EXPECTED_DATABASE}\"`)
    || !schemaText.includes('CREATE TABLE IF NOT EXISTS projects')
    || !schemaText.includes('CREATE TABLE IF NOT EXISTS users')
  ) {
    throw new Error('Metrics repository is not the approved locked D1 onboarding source')
  }

  return {
    lockedWrangler: lockedWrangler.version,
    onboardScript: join(EXPECTED_SOURCE, 'scripts', 'onboard.mjs'),
    owner: ownerFromApprovedSchema(schemaText),
  }
}

function run(label, command, commandArgs, env) {
  log.info(label)
  const result = spawnSync(command, commandArgs, {
    cwd: EXPECTED_SOURCE,
    env,
    encoding: 'utf8',
  })
  if (result.error || result.status !== 0) {
    audit({
      action,
      status: 'FAILED',
      step: label,
      code: result.status,
      signal: result.signal,
    })
    throw new Error(`${label} failed with exit code ${result.status ?? 1}; child output was withheld`)
  }
}

async function main() {
  const rawArgs = process.argv.slice(2)
  const { args, pos, commit } = parseArgs(rawArgs)
  if (
    pos.length
    || Object.keys(args).some((key) => key !== 'commit')
    || rawArgs.length > 1
    || ('commit' in args && args.commit !== true)
  ) {
    fail('usage: node scripts/actions/jan-aushadhi-metrics-onboard.mjs [--commit]')
  }

  let approved
  try {
    approved = validateSource()
  } catch (error) {
    fail(error.message)
  }

  log.info(`source: ${EXPECTED_SOURCE}`)
  log.info(`D1 database: ${EXPECTED_DATABASE}`)
  for (const project of PROJECTS) {
    log.info(`project: ${project.id} (${project.origin})`)
  }
  log.info('owner: fixed seeded GattyWorks admin')
  log.info(`pinned Wrangler: ${approved.lockedWrangler}`)

  const auditDetails = {
    source: EXPECTED_SOURCE,
    database: EXPECTED_DATABASE,
    projects: PROJECTS.map(({ id, name, origin }) => ({ id, name, origin })),
    owner: 'seeded-gattyworks-admin',
    wranglerVersion: approved.lockedWrangler,
  }

  if (!commit) {
    log.warn('DRY-RUN - approved source and exact onboarding plan validated; Cloudflare and D1 were not contacted or changed.')
    log.warn('On an approved --commit run, locked install and typecheck finish before break-glass loads the edit token.')
    audit({ action, status: 'DRY_RUN', ...auditDetails }, { required: true })
    return
  }

  const buildEnv = commandEnv()
  const npmCommand = process.platform === 'win32' ? process.execPath : npmExecutable()
  const npmCli = process.platform === 'win32'
    ? join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
    : null
  if (npmCli && !existsSync(npmCli)) throw new Error(`Pinned npm CLI is missing at ${npmCli}`)
  const npmArgs = (commandArgs) => npmCli ? [npmCli, ...commandArgs] : commandArgs

  run('install locked GattyWorks Metrics dependencies', npmCommand, npmArgs(['ci']), buildEnv)
  run('typecheck GattyWorks Metrics', npmCommand, npmArgs(['run', 'typecheck']), buildEnv)

  approved = validateSource()
  const installedWrangler = JSON.parse(
    readFileSync(join(EXPECTED_SOURCE, 'node_modules', 'wrangler', 'package.json'), 'utf8'),
  ).version
  if (installedWrangler !== approved.lockedWrangler) {
    throw new Error(`installed Wrangler ${installedWrangler} does not match lockfile ${approved.lockedWrangler}`)
  }
  wranglerExecutable(EXPECTED_SOURCE)

  const cf = bootEdit(action, auditDetails)
  const accountId = await resolveAccountId(cf)
  const mutationEnv = commandEnv({
    CLOUDFLARE_API_TOKEN: cf.token,
    CLOUDFLARE_ACCOUNT_ID: accountId,
    npm_config_offline: 'true',
    npm_config_yes: 'false',
    NO_UPDATE_NOTIFIER: '1',
  })

  for (const project of PROJECTS) {
    validateSource()
    run(`register Metrics project ${project.id}`, process.execPath, [
      approved.onboardScript,
      '--project', project.id,
      '--name', project.name,
      '--origin', project.origin,
      '--owner', approved.owner,
    ], mutationEnv)
  }

  audit({ action, status: 'COMMITTED', ...auditDetails, step: 'both projects registered' })
  log.ok('registered both fixed Jan Aushadhi Metrics projects')
}

await main()
