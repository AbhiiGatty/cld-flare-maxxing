#!/usr/bin/env node
/**
 * Guarded action: create the GazetteIntel VM ingestion service token and its
 * Access allow policy. The token secret is written once to a gitignored VM env
 * file and is never printed or audited.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { DIRS } from '../lib/paths.mjs'
import { loadEnv } from '../lib/util.mjs'
import { makeClient, resolveAccountId } from '../lib/cf.mjs'
import { audit, bootEdit, log, parseArgs } from './_lib.mjs'

const action = 'gazetteintel-vm-access'
const { args, commit } = parseArgs(process.argv.slice(2))
const outputInput = String(args.output || '')
const tokenName = 'gazetteintel-ingestion'
const policyName = 'Allow GazetteIntel ingestion service token'
const appName = 'GazetteIntel beta'

if (!outputInput || !isAbsolute(outputInput) || !outputInput.toLowerCase().endsWith('.env')) {
  log.err('usage: --output=<absolute-gitignored-vm-env-file> [--commit]')
  process.exit(1)
}
const output = resolve(outputInput)

function destinationUris(application) {
  return new Set((application?.destinations || []).map((item) => String(item?.uri || '').toLowerCase()))
}

loadEnv(DIRS.env)
const read = makeClient({ mode: 'read' })
const accountId = await resolveAccountId(read)
const [tokens, applications] = await Promise.all([
  read.getAll(`/accounts/${accountId}/access/service_tokens`, { query: { per_page: 100 } }),
  read.getAll(`/accounts/${accountId}/access/apps`, { query: { per_page: 100 } }),
])
const app = applications.find((item) => item.name === appName && destinationUris(item).has('api.gazetteintel.com'))
if (!app?.id) throw new Error('GazetteIntel Access application was not found')
const existingToken = tokens.find((item) => item.name === tokenName) || null
const policies = await read.getAll(`/accounts/${accountId}/access/apps/${app.id}/policies`, { query: { per_page: 100 } })
const tokenPolicy = existingToken
  ? policies.find((policy) => policy.decision === 'allow' && (policy.include || []).some((rule) => String(rule?.service_token?.token_id || '') === String(existingToken.id)))
  : null

if (existingToken && !existsSync(output)) {
  throw new Error(`service token exists but its local VM credential file is missing: ${output}`)
}
if (existsSync(output) && !existingToken) {
  throw new Error(`local VM credential file exists but service token ${tokenName} does not`)
}

log.info(`Access application: ${appName} (${app.id})`)
log.info(`Service token: ${tokenName} ${existingToken ? '(exists)' : '(create, 365 day expiry)'}`)
log.info(`API policy: ${tokenPolicy ? '(exists)' : '(create)'}`)
log.info(`VM credential file: ${output} ${existsSync(output) ? '(exists)' : '(write once)'}`)
log.info('The service token can reach the Access-protected app because the current Access application spans app and api hostnames.')

if (!commit) {
  log.warn('DRY-RUN - nothing changed. Re-run with --commit to apply.')
  audit({ action, status: 'DRY_RUN', appId: app.id, tokenName, tokenExists: Boolean(existingToken), policyExists: Boolean(tokenPolicy), output })
  process.exit(0)
}

const cf = bootEdit(action, { appId: app.id, tokenName, output })
let token = existingToken
if (!token) {
  const response = await cf.raw('POST', `/accounts/${accountId}/access/service_tokens`, {
    body: { name: tokenName, duration: '8760h' },
  })
  token = response.result
  if (!token?.client_id || !token?.client_secret || !token?.id) throw new Error('Cloudflare did not return a complete service token')
  mkdirSync(dirname(output), { recursive: true, mode: 0o700 })
  const temporary = `${output}.tmp`
  writeFileSync(temporary, [
    `CF_ACCESS_CLIENT_ID=${token.client_id}`,
    `CF_ACCESS_CLIENT_SECRET=${token.client_secret}`,
    'GAZETTEINTEL_API_BASE=https://api.gazetteintel.com',
    '',
  ].join('\n'), { encoding: 'utf8', mode: 0o600 })
  try { chmodSync(temporary, 0o600) } catch { /* Windows ACLs are managed separately. */ }
  renameSync(temporary, output)
  audit({ action, status: 'COMMITTED', step: 'create-service-token', tokenId: token.id })
  log.ok(`created ${tokenName} and wrote its VM credential file`)
}

const currentPolicies = await cf.getAll(`/accounts/${accountId}/access/apps/${app.id}/policies`, { query: { per_page: 100 } })
const hasPolicy = currentPolicies.some((policy) => policy.decision === 'allow' && (policy.include || []).some((rule) => String(rule?.service_token?.token_id || '') === String(token.id)))
if (!hasPolicy) {
  const response = await cf.raw('POST', `/accounts/${accountId}/access/apps/${app.id}/policies`, {
    body: {
      name: policyName,
      decision: 'allow',
      precedence: 2,
      include: [{ service_token: { token_id: token.id } }],
    },
  })
  audit({ action, status: 'COMMITTED', step: 'create-access-policy', tokenId: token.id, policyId: response.result?.id })
  log.ok('created the ingestion service-token Access policy')
}

const verifiedPolicies = await cf.getAll(`/accounts/${accountId}/access/apps/${app.id}/policies`, { query: { per_page: 100 } })
if (!existsSync(output) || !verifiedPolicies.some((policy) => policy.decision === 'allow' && (policy.include || []).some((rule) => String(rule?.service_token?.token_id || '') === String(token.id)))) {
  throw new Error('GazetteIntel VM Access verification failed')
}
audit({ action, status: 'COMMITTED', step: 'verified', appId: app.id, tokenId: token.id, output })
log.ok('GazetteIntel VM ingestion Access credentials are ready.')
