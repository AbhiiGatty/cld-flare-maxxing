#!/usr/bin/env node
/**
 * Guarded action: install the four Social Desk Meta bindings as Worker secrets.
 *
 * Requires:
 *   --source=<absolute application repo path>
 *   --secret-env=<absolute .env.local path>
 *   --worker=<Worker service name>
 *
 * DRY-RUN by default. Add --commit to mutate the account.
 */
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
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

const REQUIRED_SECRETS = [
  'THREADS_USER_TOKEN',
  'THREADS_USER_ID',
  'INSTAGRAM_USER_TOKEN',
  'INSTAGRAM_USER_ID',
]

const { args, commit } = parseArgs(process.argv.slice(2))
const action = 'social-desk-meta-secrets'
const sourceInput = String(args.source || '')
const secretEnvInput = String(args['secret-env'] || '')
const workerName = String(args.worker || '')

if (
  !sourceInput
  || !secretEnvInput
  || !workerName
  || !isAbsolute(sourceInput)
  || !isAbsolute(secretEnvInput)
) {
  log.err('usage: --source=<absolute-repo-path> --secret-env=<absolute-.env.local-path> --worker=<worker-name> [--commit]')
  process.exit(1)
}
if (!/^[a-z0-9-]+$/.test(workerName)) {
  log.err('invalid --worker=<worker-name>')
  process.exit(1)
}

const source = resolve(sourceInput)
const secretEnv = resolve(secretEnvInput)
const socialDir = join(source, 'tooling', 'social')
const config = join(socialDir, 'cloud', 'wrangler.jsonc')
const packageFile = join(socialDir, 'package.json')

if (!existsSync(config) || !existsSync(packageFile) || !existsSync(secretEnv)) {
  log.err('source, Social Desk configuration, or secret env file is missing')
  process.exit(1)
}

const configText = readFileSync(config, 'utf8')
if (
  !configText.includes(workerName)
  || REQUIRED_SECRETS.some((name) => !configText.includes(`"${name}"`))
) {
  log.err('Social Desk configuration does not declare all required Meta secrets')
  process.exit(1)
}

function parseEnvFile(file) {
  const values = {}
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const index = line.indexOf('=')
    if (index < 1) continue
    const key = line.slice(0, index).trim()
    let value = line.slice(index + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    values[key] = value
  }
  return values
}

const sourceValues = parseEnvFile(secretEnv)
const missing = REQUIRED_SECRETS.filter((name) => !sourceValues[name])
if (missing.length) {
  log.err(`secret env is missing: ${missing.join(', ')}`)
  process.exit(1)
}

loadEnv(join(DIRS.root, '.env'))
const read = makeClient({ mode: 'read' })
const accountId = await resolveAccountId(read)
const service = await read.get(
  `/accounts/${accountId}/workers/services/${encodeURIComponent(workerName)}`,
)
if (!service) {
  log.err(`${workerName} Worker does not exist`)
  process.exit(1)
}

log.info(`source: ${source}`)
log.info(`Worker: ${workerName}`)
log.info(`Install/update encrypted bindings: ${REQUIRED_SECRETS.join(', ')}`)
log.info('Secret values will not be logged, audited, or committed.')

if (!commit) {
  log.warn('DRY-RUN - nothing changed. Re-run with --commit to apply.')
  audit({
    action,
    status: 'DRY_RUN',
    source,
    worker: workerName,
    secretNames: REQUIRED_SECRETS,
  })
} else {
  const install = spawnSync(npmExecutable(), ['ci'], {
    cwd: socialDir,
    env: commandEnv(),
    encoding: 'utf8',
  })
  if (install.error || install.status !== 0) {
    audit({ action, status: 'FAILED', step: 'npm-ci', code: install.status })
    throw new Error(`locked Social Desk dependency install failed with exit code ${install.status ?? 1}`)
  }

  const cf = bootEdit(action, {
    source,
    worker: workerName,
    secretNames: REQUIRED_SECRETS,
  })
  const tempRoot = resolve(tmpdir())
  const secretDir = mkdtempSync(join(tempRoot, 'social-desk-secrets-'))
  const secretFile = join(secretDir, 'secrets.json')
  const secrets = Object.fromEntries(REQUIRED_SECRETS.map((name) => [name, sourceValues[name]]))
  try {
    writeFileSync(secretFile, JSON.stringify(secrets), { encoding: 'utf8', mode: 0o600 })
    const wranglerBin = wranglerExecutable(socialDir)
    const result = spawnSync(process.execPath, [
      wranglerBin,
      'secret',
      'bulk',
      secretFile,
      '--config',
      config,
    ], {
      cwd: socialDir,
      env: commandEnv({
        CLOUDFLARE_API_TOKEN: cf.token,
        CLOUDFLARE_ACCOUNT_ID: accountId,
      }),
      encoding: 'utf8',
    })
    let output = `${result.stdout || ''}${result.stderr || ''}`
    for (const value of Object.values(secrets)) {
      output = output.split(value).join('[hidden]')
    }
    if (output.trim()) process.stdout.write(output.endsWith('\n') ? output : `${output}\n`)
    if (result.error || result.status !== 0) {
      audit({
        action,
        status: 'FAILED',
        step: 'secret-bulk',
        code: result.status,
        error: result.error?.message,
      })
      throw new Error(`Worker secret bulk failed with exit code ${result.status ?? 1}`)
    }

    const settings = await cf.get(
      `/accounts/${accountId}/workers/scripts/${encodeURIComponent(workerName)}/settings`,
    )
    const installedNames = new Set(
      (settings.bindings || [])
        .filter((binding) => binding.type === 'secret_text')
        .map((binding) => binding.name),
    )
    const unverified = REQUIRED_SECRETS.filter((name) => !installedNames.has(name))
    if (unverified.length) {
      throw new Error(`Worker secret verification failed for: ${unverified.join(', ')}`)
    }

    audit({
      action,
      status: 'COMMITTED',
      source,
      worker: workerName,
      secretNames: REQUIRED_SECRETS,
      step: 'verified',
    })
    log.ok('Social Desk Meta secrets installed and verified.')
  } finally {
    const resolvedSecretDir = resolve(secretDir)
    if (resolvedSecretDir.startsWith(`${tempRoot}\\`) || resolvedSecretDir.startsWith(`${tempRoot}/`)) {
      rmSync(resolvedSecretDir, { recursive: true, force: true })
    }
  }
}
