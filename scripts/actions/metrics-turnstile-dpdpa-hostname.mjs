#!/usr/bin/env node
/**
 * Guarded action: allow the DPDPA landing to use the existing Metrics
 * Turnstile widget.
 *
 * The widget, site key, current hostname, and added hostname are fixed. The
 * action refuses an unexpected widget state so a PUT cannot remove a hostname
 * or change another setting. Dry-run is the default. Add --commit only after
 * the printed plan is approved.
 */
import { resolveAccountId } from '../lib/cf.mjs'
import {
  audit,
  bootEdit,
  bootRead,
  log,
  parseArgs,
} from './_lib.mjs'

const action = 'metrics-turnstile-dpdpa-hostname'
const EXPECTED_WIDGET_NAME = 'metrics-gattyworks'
const EXPECTED_SITEKEY = '0x4AAAAAAEI3WFeNzqlNq0gN'
const METRICS_HOSTNAME = 'metrics.gattyworks.com'
const DPDPA_HOSTNAME = 'dpdpa.gattyworks.com'
const BEFORE_DOMAINS = Object.freeze([METRICS_HOSTNAME])
const AFTER_DOMAINS = Object.freeze([METRICS_HOSTNAME, DPDPA_HOSTNAME])
const EXPECTED_SETTINGS = Object.freeze({
  mode: 'managed',
  bot_fight_mode: false,
  clearance_level: 'no_clearance',
  ephemeral_id: false,
  offlabel: false,
  region: 'world',
})

function fail(message) {
  throw new Error(message)
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
  if (!widget || typeof widget !== 'object') fail('Metrics Turnstile widget was not found')
  if (widget.name !== EXPECTED_WIDGET_NAME || widget.sitekey !== EXPECTED_SITEKEY) {
    fail('Turnstile widget identity does not match the fixed Metrics widget')
  }
  for (const [field, expected] of Object.entries(EXPECTED_SETTINGS)) {
    if (widget[field] !== expected) {
      fail(`Turnstile widget ${field} changed; refusing the hostname update`)
    }
  }
}

function hostnameState(widget) {
  if (domainsMatch(widget.domains, BEFORE_DOMAINS)) return 'before'
  if (domainsMatch(widget.domains, AFTER_DOMAINS)) return 'after'
  fail(`Turnstile widget has an unexpected hostname list: ${sortedDomains(widget.domains).join(', ')}`)
}

function logSafeWidget(label, widget) {
  log.info(`${label}: ${JSON.stringify(safeProjection(widget))}`)
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
    fail('usage: node scripts/actions/metrics-turnstile-dpdpa-hostname.mjs [--commit]')
  }
  return { commit }
}

async function readWidget(cf, accountId) {
  return cf.get(
    `/accounts/${accountId}/challenges/widgets/${encodeURIComponent(EXPECTED_SITEKEY)}`,
  )
}

async function main() {
  const { commit } = parseCommandLine()
  const read = bootRead()
  const readAccountId = await resolveAccountId(read)
  const observed = await readWidget(read, readAccountId)
  assertExpectedWidget(observed)
  const observedState = hostnameState(observed)

  log.info(`widget: ${EXPECTED_WIDGET_NAME}`)
  log.info(`site key: ${EXPECTED_SITEKEY}`)
  log.info(`add hostname: ${DPDPA_HOSTNAME}`)
  logSafeWidget('observed safe configuration', observed)

  const auditDetails = {
    widget: EXPECTED_WIDGET_NAME,
    sitekey: EXPECTED_SITEKEY,
    beforeDomains: BEFORE_DOMAINS,
    afterDomains: AFTER_DOMAINS,
    observed: safeProjection(observed),
  }

  if (!commit) {
    if (observedState === 'after') {
      log.ok('DRY-RUN: the DPDPA hostname is already allowed; nothing would change.')
    } else {
      log.warn(`DRY-RUN: would add ${DPDPA_HOSTNAME} to the fixed Metrics Turnstile widget.`)
    }
    audit({
      action,
      status: 'DRY_RUN',
      noChange: observedState === 'after',
      ...auditDetails,
    }, { required: true })
    return
  }

  const cf = bootEdit(action, auditDetails)
  const editAccountId = await resolveAccountId(cf)
  if (editAccountId !== readAccountId) {
    fail('read and edit tokens resolved to different Cloudflare accounts')
  }

  const current = await readWidget(cf, editAccountId)
  assertExpectedWidget(current)
  const currentState = hostnameState(current)
  logSafeWidget('commit preflight safe configuration', current)

  if (currentState === 'after') {
    audit({
      action,
      status: 'COMMITTED',
      noChange: true,
      widget: safeProjection(current),
    }, { required: true })
    log.ok('The DPDPA hostname is already allowed. No API update was sent.')
    return
  }

  const endpoint = `/accounts/${editAccountId}/challenges/widgets/${encodeURIComponent(EXPECTED_SITEKEY)}`
  const update = await cf.raw('PUT', endpoint, {
    body: {
      name: EXPECTED_WIDGET_NAME,
      domains: [...AFTER_DOMAINS],
      mode: EXPECTED_SETTINGS.mode,
      bot_fight_mode: EXPECTED_SETTINGS.bot_fight_mode,
      clearance_level: EXPECTED_SETTINGS.clearance_level,
      ephemeral_id: EXPECTED_SETTINGS.ephemeral_id,
      offlabel: EXPECTED_SETTINGS.offlabel,
    },
  })
  const updated = update?.result
  assertExpectedWidget(updated)
  if (hostnameState(updated) !== 'after') {
    fail('Turnstile update response did not contain the exact approved hostname list')
  }
  logSafeWidget('update response safe configuration', updated)

  const verified = await readWidget(cf, editAccountId)
  assertExpectedWidget(verified)
  if (hostnameState(verified) !== 'after') {
    fail('fresh Turnstile verification did not contain the exact approved hostname list')
  }
  logSafeWidget('verified safe configuration', verified)

  audit({
    action,
    status: 'COMMITTED',
    noChange: false,
    before: safeProjection(current),
    after: safeProjection(verified),
  }, { required: true })
  log.ok(`Allowed ${DPDPA_HOSTNAME} on ${EXPECTED_WIDGET_NAME} and verified the live widget.`)
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
