#!/usr/bin/env node
/**
 * Guarded action: provision the fixed Turnstile widget used by the Jan
 * Aushadhi price-watch form and install its secret on the fixed Worker.
 *
 * The action creates the widget when absent. If the exact widget already
 * exists, it rotates the secret before installing it. Widget secrets never
 * reach logs or audit records. Dry-run is the default.
 */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { existsSync, lstatSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolveAccountId } from '../lib/cf.mjs'
import {
  audit,
  bootEdit,
  bootRead,
  commandEnv,
  log,
  parseArgs,
  wranglerExecutable,
} from './_lib.mjs'

const action = 'jan-aushadhi-turnstile-provision'
const actionDirectory = dirname(fileURLToPath(import.meta.url))
const maxxingRoot = resolve(actionDirectory, '..', '..')
const EXPECTED_SOURCE = resolve(maxxingRoot, '..', 'jan-aushadhi-finder')
const EXPECTED_WORKER = 'jan-aushadhi-finder'
const EXPECTED_WIDGET_NAME = 'jan-aushadhi-price-watch'
const EXPECTED_SHARED_METRICS_SITEKEY = '0x4AAAAAAEI3WFeNzqlNq0gN'
const EXPECTED_DOMAINS = Object.freeze([
  'india-aushadi.gattyworks.com',
  'aushadhi.gattyworks.com',
])
const EXPECTED_SETTINGS = Object.freeze({
  mode: 'managed',
  bot_fight_mode: false,
  clearance_level: 'no_clearance',
  ephemeral_id: false,
  offlabel: false,
  region: 'world',
})
const APPROVED_FILES = Object.freeze({
  'package.json': '37021f574f105749478508fbdf03b0b3b7263cc65b215479c0820e15ba38d8e8',
  'package-lock.json': 'cdb61514477088d1b90745e92a7cdd6b7e96673ef28a4d0b5f2dfd2a2db9a4c5',
  'wrangler.toml': '9c9da99f7fb5fb95b3717b735b050ccf3e5804a197d4eba1367fe2d475682abd',
})

function fail(message) {
  throw new Error(message)
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function sortedDomains(domains) {
  if (!Array.isArray(domains) || domains.some((domain) => typeof domain !== 'string')) {
    fail('Turnstile widget returned an invalid hostname list')
  }
  return [...domains].sort()
}

function domainsMatch(actual, expected) {
  const left = sortedDomains(actual)
  const right = sortedDomains(expected)
  return left.length === right.length && left.every((domain, index) => domain === right[index])
}

function safeProjection(widget) {
  return {
    name: widget?.name,
    sitekey: widget?.sitekey,
    domains: sortedDomains(widget?.domains),
    mode: widget?.mode,
    bot_fight_mode: widget?.bot_fight_mode,
    clearance_level: widget?.clearance_level,
    ephemeral_id: widget?.ephemeral_id,
    offlabel: widget?.offlabel,
    region: widget?.region,
    deployed_via: widget?.deployed_via,
    last_modified_via: widget?.last_modified_via,
    modified_on: widget?.modified_on,
  }
}

function assertExpectedWidget(widget) {
  if (!widget || typeof widget !== 'object') fail('Jan Aushadhi Turnstile widget was not returned')
  if (widget.name !== EXPECTED_WIDGET_NAME || typeof widget.sitekey !== 'string') {
    fail('Turnstile widget identity does not match the fixed Jan Aushadhi widget')
  }
  if (!domainsMatch(widget.domains, EXPECTED_DOMAINS)) {
    fail(`Turnstile widget has an unexpected hostname list: ${sortedDomains(widget.domains).join(', ')}`)
  }
  for (const [field, expected] of Object.entries(EXPECTED_SETTINGS)) {
    if (widget[field] !== expected) fail(`Turnstile widget ${field} changed; refusing to continue`)
  }
}

function validateSource() {
  if (!existsSync(EXPECTED_SOURCE) || lstatSync(EXPECTED_SOURCE).isSymbolicLink()) {
    fail(`expected sibling Jan Aushadhi repository is missing or linked: ${EXPECTED_SOURCE}`)
  }
  for (const [relativePath, approvedHash] of Object.entries(APPROVED_FILES)) {
    const path = join(EXPECTED_SOURCE, relativePath)
    if (!existsSync(path) || lstatSync(path).isSymbolicLink()) {
      fail(`approved Jan Aushadhi source file is missing or linked: ${relativePath}`)
    }
    if (sha256(path) !== approvedHash) fail(`approved Jan Aushadhi source fingerprint changed: ${relativePath}`)
  }

  const packageJson = JSON.parse(readFileSync(join(EXPECTED_SOURCE, 'package.json'), 'utf8'))
  const lock = JSON.parse(readFileSync(join(EXPECTED_SOURCE, 'package-lock.json'), 'utf8'))
  const config = readFileSync(join(EXPECTED_SOURCE, 'wrangler.toml'), 'utf8')
  const lockedWrangler = lock.packages?.['node_modules/wrangler']?.version
  if (
    packageJson.name !== 'india-jan-aushadhi-dost'
    || typeof lockedWrangler !== 'string'
    || !config.includes(`name = "${EXPECTED_WORKER}"`)
    || !config.includes('pattern = "india-aushadi.gattyworks.com"')
    || !config.includes('pattern = "aushadhi.gattyworks.com"')
  ) {
    fail('Jan Aushadhi repository is not the approved fixed Worker source')
  }

  const executable = wranglerExecutable(EXPECTED_SOURCE)
  const installed = JSON.parse(
    readFileSync(join(EXPECTED_SOURCE, 'node_modules', 'wrangler', 'package.json'), 'utf8'),
  ).version
  if (installed !== lockedWrangler) fail(`installed Wrangler ${installed} does not match lockfile ${lockedWrangler}`)
  return { executable, lockedWrangler }
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
    fail('usage: node scripts/actions/jan-aushadhi-turnstile-provision.mjs [--commit]')
  }
  return { commit }
}

async function inspectWidgets(cf, accountId) {
  const widgets = await cf.getAll(`/accounts/${accountId}/challenges/widgets`, {
    query: { per_page: 50 },
  })
  const named = widgets.filter((widget) => widget?.name === EXPECTED_WIDGET_NAME)
  if (named.length > 1) fail('more than one widget has the fixed Jan Aushadhi name')
  const widget = named[0] ?? null
  if (widget) assertExpectedWidget(widget)

  const overlapping = widgets.filter((candidate) => (
    candidate?.name !== EXPECTED_WIDGET_NAME
    && Array.isArray(candidate?.domains)
    && candidate.domains.some((domain) => EXPECTED_DOMAINS.includes(domain))
  ))
  if (overlapping.length > 1) fail('more than one different Turnstile widget contains a Jan Aushadhi hostname')
  const sharedOverlap = overlapping[0] ?? null
  if (sharedOverlap && sharedOverlap.sitekey !== EXPECTED_SHARED_METRICS_SITEKEY) {
    fail('an unexpected Turnstile widget contains a Jan Aushadhi hostname')
  }
  return { widget, sharedOverlap }
}

function widgetUpdateWithoutJanDomains(widget) {
  const body = {
    domains: sortedDomains(widget.domains).filter((domain) => !EXPECTED_DOMAINS.includes(domain)),
  }
  for (const field of Object.keys(EXPECTED_SETTINGS).concat('name')) {
    if (widget[field] !== undefined) body[field] = widget[field]
  }
  return body
}

function runWrangler(label, executable, args, env, input) {
  const result = spawnSync(process.execPath, [executable, ...args], {
    cwd: EXPECTED_SOURCE,
    env,
    input,
    encoding: 'utf8',
  })
  if (result.error || result.status !== 0) {
    audit({ action, status: 'FAILED', step: label, code: result.status, signal: result.signal })
    fail(`${label} failed with exit code ${result.status ?? 1}; child output was withheld`)
  }
  return result.stdout
}

async function main() {
  const { commit } = parseCommandLine()
  const approved = validateSource()
  const read = bootRead()
  const readAccountId = await resolveAccountId(read)
  const observed = await inspectWidgets(read, readAccountId)
  const observedState = observed.widget ? 'existing' : 'absent'

  log.info(`source: ${EXPECTED_SOURCE}`)
  log.info(`Worker: ${EXPECTED_WORKER}`)
  log.info(`widget: ${EXPECTED_WIDGET_NAME}`)
  log.info(`hostnames: ${[...EXPECTED_DOMAINS].join(', ')}`)
  log.info(`pinned Wrangler: ${approved.lockedWrangler}`)
  if (observed.widget) log.info(`observed safe configuration: ${JSON.stringify(safeProjection(observed.widget))}`)
  if (observed.sharedOverlap) {
    log.info('observed Jan Aushadhi hostnames on the fixed shared Metrics widget')
  }

  const auditDetails = {
    source: EXPECTED_SOURCE,
    worker: EXPECTED_WORKER,
    widget: EXPECTED_WIDGET_NAME,
    domains: EXPECTED_DOMAINS,
    settings: EXPECTED_SETTINGS,
    observedState,
    observed: observed.widget ? safeProjection(observed.widget) : null,
    sharedMetricsOverlap: observed.sharedOverlap ? safeProjection(observed.sharedOverlap) : null,
  }

  if (!commit) {
    if (observed.widget) {
      log.warn('DRY-RUN: would rotate the exact widget secret and replace TURNSTILE_SECRET_KEY on the fixed Worker.')
    } else {
      log.warn('DRY-RUN: would create the fixed widget and install TURNSTILE_SECRET_KEY on the fixed Worker.')
    }
    if (observed.sharedOverlap) {
      log.warn('DRY-RUN: would first remove only the two Jan Aushadhi hostnames from the fixed shared Metrics widget.')
    }
    audit({ action, status: 'DRY_RUN', ...auditDetails }, { required: true })
    return
  }

  const cf = bootEdit(action, auditDetails)
  const editAccountId = await resolveAccountId(cf)
  if (editAccountId !== readAccountId) fail('read and edit tokens resolved to different Cloudflare accounts')

  const current = await inspectWidgets(cf, editAccountId)
  const currentState = current.widget ? 'existing' : 'absent'
  if (currentState !== observedState) fail('Turnstile widget state changed after dry-run preflight')
  const observedOverlap = observed.sharedOverlap ? safeProjection(observed.sharedOverlap) : null
  const currentOverlap = current.sharedOverlap ? safeProjection(current.sharedOverlap) : null
  if (JSON.stringify(currentOverlap) !== JSON.stringify(observedOverlap)) {
    fail('shared Metrics Turnstile widget state changed after dry-run preflight')
  }

  if (current.sharedOverlap) {
    const sharedSitekey = encodeURIComponent(current.sharedOverlap.sitekey)
    const updated = await cf.raw(
      'PUT',
      `/accounts/${editAccountId}/challenges/widgets/${sharedSitekey}`,
      { body: widgetUpdateWithoutJanDomains(current.sharedOverlap) },
    )
    const updatedShared = updated?.result
    if (
      !updatedShared
      || updatedShared.sitekey !== EXPECTED_SHARED_METRICS_SITEKEY
      || updatedShared.domains.some((domain) => EXPECTED_DOMAINS.includes(domain))
    ) {
      fail('shared Metrics widget still contains a Jan Aushadhi hostname after update')
    }
  }

  let response
  if (current.widget) {
    response = await cf.raw(
      'POST',
      `/accounts/${editAccountId}/challenges/widgets/${encodeURIComponent(current.widget.sitekey)}/rotate_secret`,
      { body: { invalidate_immediately: true } },
    )
  } else {
    response = await cf.raw('POST', `/accounts/${editAccountId}/challenges/widgets`, {
      body: {
        name: EXPECTED_WIDGET_NAME,
        domains: [...EXPECTED_DOMAINS],
        ...EXPECTED_SETTINGS,
      },
    })
  }

  const provisioned = response?.result
  assertExpectedWidget(provisioned)
  const widgetSecret = provisioned.secret
  if (typeof widgetSecret !== 'string' || widgetSecret.length < 20) {
    fail('Turnstile mutation did not return a usable secret')
  }

  const mutationEnv = commandEnv({
    CLOUDFLARE_API_TOKEN: cf.token,
    CLOUDFLARE_ACCOUNT_ID: editAccountId,
    NO_UPDATE_NOTIFIER: '1',
  })
  runWrangler(
    'install fixed Worker Turnstile secret',
    approved.executable,
    ['secret', 'put', 'TURNSTILE_SECRET_KEY', '--name', EXPECTED_WORKER],
    mutationEnv,
    `${widgetSecret}\n`,
  )

  const secretList = runWrangler(
    'verify fixed Worker secret names',
    approved.executable,
    ['secret', 'list', '--name', EXPECTED_WORKER],
    mutationEnv,
  )
  const names = JSON.parse(secretList).map((item) => item?.name)
  if (!names.includes('TURNSTILE_SECRET_KEY')) fail('fresh Worker secret list does not contain TURNSTILE_SECRET_KEY')

  const verified = await cf.get(
    `/accounts/${editAccountId}/challenges/widgets/${encodeURIComponent(provisioned.sitekey)}`,
  )
  assertExpectedWidget(verified)
  const safe = safeProjection(verified)
  audit({
    action,
    status: 'COMMITTED',
    state: current.widget ? 'rotated' : 'created',
    removedSharedMetricsOverlap: Boolean(current.sharedOverlap),
    widget: safe,
  })
  log.info(`verified safe configuration: ${JSON.stringify(safe)}`)
  log.ok('Provisioned the fixed Jan Aushadhi Turnstile widget and installed its Worker secret.')
}

try {
  await main()
} catch (error) {
  audit({
    action,
    status: 'FAILED',
    reason: error instanceof Error ? error.message : 'unknown error',
  })
  log.err(error instanceof Error ? error.message : 'unknown error')
  process.exitCode = 1
}
