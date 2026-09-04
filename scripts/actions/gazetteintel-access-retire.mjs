#!/usr/bin/env node
/**
 * Guarded action: retire the `GazetteIntel beta` Cloudflare Access application.
 *
 * GazetteIntel now authenticates with app-owned Google SSO (API session cookie +
 * RBAC), so app.gazetteintel.com and api.gazetteintel.com must not sit behind
 * Access. The application covers exactly those two hosts, so removing the hosts
 * means deleting the application. The Google identity provider is account-level
 * and is preserved (rename it with gattyworks-google-idp-rename.mjs).
 *
 * Preconditions checked before break-glass:
 *   - --source points at a clean checkout of GazetteIntel at origin/main whose
 *     api/wrangler.jsonc has AUTH_MODE "google" and a non-empty GOOGLE_CLIENT_ID
 *     (the SSO build is what production runs).
 *   - --google-signin-verified attests that a live Google sign-in on
 *     https://app.gazetteintel.com/app/signin succeeded.
 *   - The application has no service-token or non_identity policies (nothing
 *     else depends on it).
 *
 * DRY-RUN by default; --commit deletes the application.
 */
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { DIRS } from '../lib/paths.mjs'
import { loadEnv } from '../lib/util.mjs'
import { makeClient, resolveAccountId } from '../lib/cf.mjs'
import { audit, bootEdit, log, parseArgs } from './_lib.mjs'

const action = 'gazetteintel-access-retire'
const appName = 'GazetteIntel beta'
const hosts = ['app.gazetteintel.com', 'api.gazetteintel.com']
const providerNames = ['GazetteIntel Google', 'GattyWorks Google']
const { args, commit } = parseArgs(process.argv.slice(2))
const sourceInput = String(args.source || '')
const attested = args['google-signin-verified'] === true || args['google-signin-verified'] === 'true'

if (!sourceInput || !isAbsolute(sourceInput)) {
  log.err('usage: --source=<absolute-clean-GazetteIntel-main-checkout> --google-signin-verified [--commit]')
  process.exit(1)
}
const source = resolve(sourceInput)
const configPath = join(source, 'api/wrangler.jsonc')
if (!existsSync(configPath)) {
  log.err('source is missing api/wrangler.jsonc')
  process.exit(1)
}
const git = (gitArgs) => String(spawnSync('git', ['-C', source, ...gitArgs], { encoding: 'utf8' }).stdout || '').trim()
const head = git(['rev-parse', 'HEAD'])
if (git(['status', '--porcelain']) || !head || head !== git(['rev-parse', 'origin/main'])) {
  log.err('source must be a clean checkout at the current origin/main commit')
  process.exit(1)
}
const config = readFileSync(configPath, 'utf8')
const clientId = (config.match(/"GOOGLE_CLIENT_ID"\s*:\s*"([^"]*)"/) || [])[1] || ''
if (!/"AUTH_MODE"\s*:\s*"google"/.test(config) || !clientId.endsWith('.apps.googleusercontent.com')) {
  log.err('api/wrangler.jsonc on origin/main must set AUTH_MODE "google" and a real GOOGLE_CLIENT_ID before Access is retired')
  process.exit(1)
}

loadEnv(DIRS.env)
const read = makeClient({ mode: 'read' })
const accountId = await resolveAccountId(read)

const destinationUris = (app) => (app?.destinations || []).map((item) => String(item?.uri || '').toLowerCase()).sort()
async function findApp(client) {
  const apps = await client.getAll(`/accounts/${accountId}/access/apps`, { query: { per_page: 100 } })
  return apps.find((item) => item.name === appName) || null
}
async function findProviders(client) {
  const providers = await client.getAll(`/accounts/${accountId}/access/identity_providers`, { query: { per_page: 100 } })
  return providers.filter((provider) => providerNames.includes(provider.name))
}

const app = await findApp(read)
const providers = await findProviders(read)
if (!providers.length) throw new Error('The Google identity provider was not found; refusing to change Access without it')

if (!app) {
  log.ok(`${appName} is already absent. Nothing to do.`)
  audit({ action, status: 'DRY_RUN', appExists: false, providerIds: providers.map((p) => p.id) })
  process.exit(0)
}
if (JSON.stringify(destinationUris(app)) !== JSON.stringify([...hosts].sort())) {
  throw new Error(`${appName} covers ${destinationUris(app).join(', ')}; expected exactly ${hosts.join(', ')}`)
}
const policies = await read.getAll(`/accounts/${accountId}/access/apps/${app.id}/policies`, { query: { per_page: 100 } })
const machinePolicies = policies.filter((policy) => policy.decision === 'non_identity' || (policy.include || []).some((rule) => rule?.service_token || rule?.any_valid_service_token))
if (machinePolicies.length) {
  throw new Error(`${appName} has service-token policies (${machinePolicies.map((p) => p.name).join(', ')}); retire those clients first`)
}

log.info(`Access application: ${appName} (${app.id}) hosts ${destinationUris(app).join(', ')} -> delete`)
log.info(`Policies removed with it: ${policies.map((policy) => `${policy.name} [${policy.decision}]`).join('; ') || 'none'}`)
log.info(`Identity provider preserved: ${providers.map((provider) => `${provider.name} (${provider.id})`).join(', ')}`)
log.info(`SSO build on origin/main: ${head.slice(0, 7)}, GOOGLE_CLIENT_ID ends with ${clientId.slice(-30)}`)
log.info(`Live Google sign-in verified by operator: ${attested ? 'yes' : 'NO (pass --google-signin-verified after testing)'}`)

if (!commit) {
  log.warn('DRY-RUN - nothing changed. Re-run with --commit to apply.')
  audit({ action, status: 'DRY_RUN', appId: app.id, hosts: destinationUris(app), policyCount: policies.length, attested, sourceCommit: head })
  process.exit(0)
}
if (!attested) {
  log.err('refusing to retire Access before a live Google sign-in has been verified (--google-signin-verified)')
  process.exit(1)
}

const cf = bootEdit(action, { appId: app.id, appName, hosts, sourceCommit: head })
await cf.raw('DELETE', `/accounts/${accountId}/access/apps/${app.id}`)
audit({ action, status: 'COMMITTED', step: 'delete-access-app', appId: app.id, appName })
log.ok(`deleted Access application ${appName}`)

const after = await findApp(cf)
const providersAfter = await findProviders(cf)
if (after || providersAfter.length !== providers.length) {
  audit({ action, status: 'FAILED', step: 'verify', appId: app.id })
  throw new Error('GazetteIntel Access retirement verification failed')
}
audit({ action, status: 'COMMITTED', step: 'verified', appId: app.id, providerIds: providersAfter.map((p) => p.id) })
log.ok('GazetteIntel hosts are no longer behind Cloudflare Access; the Google identity provider is intact.')
