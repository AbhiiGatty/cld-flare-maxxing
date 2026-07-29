#!/usr/bin/env node
/**
 * Guarded action: provision the GattyWorks Deep Research control plane.
 *
 * Creates, idempotently:
 * - a D1 database
 * - a human-facing Access app with an exact-email Allow policy
 * - an Access service token
 * - a service-token-only Access app for the private VM runner
 * - a proxied tunnel CNAME for the runner
 *
 * The service-token credentials and a generated HMAC secret are written once
 * to secrets/deep-research.json. Secret values are never printed or audited.
 *
 * DRY-RUN by default. Add --commit to mutate the account.
 */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { DIRS } from '../lib/paths.mjs'
import { loadEnv } from '../lib/util.mjs'
import { makeClient, resolveAccountId } from '../lib/cf.mjs'
import { bootEdit, parseArgs, resolveZone, log, audit } from './_lib.mjs'

const { args, commit } = parseArgs(process.argv.slice(2))
const action = 'deep-research-provision'
const databaseName = String(args.database || '')
const domain = String(args.domain || '').toLowerCase()
const runnerDomain = String(args['runner-domain'] || '').toLowerCase()
const zoneRef = String(args.zone || '')
const tunnelId = String(args.tunnel || '').toLowerCase()
const appName = String(args.name || 'GattyWorks Deep Research')
const tokenName = `${appName} Runner`
const secretFile = join(DIRS.root, 'secrets', 'deep-research.json')

loadEnv(DIRS.env)
const emails = String(args.emails || process.env.DEEP_RESEARCH_ALLOWED_EMAILS || '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean)

if (!databaseName || !domain || !runnerDomain || !zoneRef || !tunnelId) {
  log.err(
    'usage: --database=<d1-name> --domain=<app-domain> --runner-domain=<runner-domain> '
      + '--zone=<zone> --tunnel=<tunnel-uuid> [--name=<app-name>] '
      + '[--emails=<addresses>] [--commit]',
  )
  process.exit(1)
}
if (
  !/^[a-z0-9-]+$/.test(databaseName)
  || !/^[a-z0-9.-]+$/.test(domain)
  || !domain.includes('.')
  || !/^[a-z0-9.-]+$/.test(runnerDomain)
  || !runnerDomain.includes('.')
  || !/^[0-9a-f-]{36}$/.test(tunnelId)
) {
  log.err('database, domain, runner domain, or tunnel argument is invalid')
  process.exit(1)
}
if (!emails.length || emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
  log.err('provide valid member addresses with --emails=<email1,email2> or DEEP_RESEARCH_ALLOWED_EMAILS')
  process.exit(1)
}

function loadSecretBundle() {
  if (!existsSync(secretFile)) return null
  const bundle = JSON.parse(readFileSync(secretFile, 'utf8'))
  const required = [
    'runnerAccessClientId',
    'runnerAccessClientSecret',
    'runnerHmacSecret',
    'serviceTokenId',
  ]
  if (required.some((key) => typeof bundle[key] !== 'string' || !bundle[key])) {
    throw new Error(`${secretFile} is incomplete; refusing to rotate or replace credentials`)
  }
  return bundle
}

function writeSecretBundle(bundle) {
  mkdirSync(dirname(secretFile), { recursive: true, mode: 0o700 })
  const temporary = `${secretFile}.tmp`
  writeFileSync(temporary, `${JSON.stringify(bundle, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
  try {
    chmodSync(temporary, 0o600)
  } catch {
    // Windows ACLs are managed separately; the directory is gitignored.
  }
  renameSync(temporary, secretFile)
}

const read = makeClient({ mode: 'read' })
const accountId = await resolveAccountId(read)
const zoneId = await resolveZone(read, zoneRef)

async function accountState(client) {
  const [databases, applications, organization, serviceTokens, tunnel, dnsRecords] = await Promise.all([
    client.getAll(`/accounts/${accountId}/d1/database`, { query: { per_page: 100 } }),
    client.getAll(`/accounts/${accountId}/access/apps`, { query: { per_page: 100 } }),
    client.get(`/accounts/${accountId}/access/organizations`).catch(() => null),
    client.getAll(`/accounts/${accountId}/access/service_tokens`, { query: { per_page: 100 } }),
    client.get(`/accounts/${accountId}/cfd_tunnel/${tunnelId}`),
    client.getAll(`/zones/${zoneId}/dns_records`, {
      query: { type: 'CNAME', name: runnerDomain, per_page: 100 },
    }),
  ])

  const database = databases.find((item) => item.name === databaseName) || null
  const humanApp = applications.find(
    (item) => String(item.domain || '').toLowerCase() === domain,
  ) || null
  const runnerApp = applications.find(
    (item) => String(item.domain || '').toLowerCase() === runnerDomain,
  ) || null
  const serviceToken = serviceTokens.find((item) => item.name === tokenName) || null
  const dnsRecord = dnsRecords.find(
    (item) => String(item.name || '').toLowerCase() === runnerDomain,
  ) || null

  const [humanPolicies, runnerPolicies] = await Promise.all([
    humanApp?.id
      ? client.getAll(`/accounts/${accountId}/access/apps/${humanApp.id}/policies`, {
        query: { per_page: 100 },
      }).catch(() => [])
      : [],
    runnerApp?.id
      ? client.getAll(`/accounts/${accountId}/access/apps/${runnerApp.id}/policies`, {
        query: { per_page: 100 },
      }).catch(() => [])
      : [],
  ])

  return {
    database,
    humanApp,
    humanPolicies,
    runnerApp,
    runnerPolicies,
    organization,
    serviceToken,
    tunnel,
    dnsRecord,
  }
}

function exactEmailPolicy(policies) {
  return policies.find((policy) => {
    if (policy.decision !== 'allow') return false
    const found = new Set(
      (policy.include || [])
        .map((rule) => rule?.email?.email)
        .filter(Boolean)
        .map((email) => String(email).toLowerCase()),
    )
    return emails.every((email) => found.has(email)) && found.size === emails.length
  }) || null
}

function exactServiceTokenPolicy(policies, tokenId) {
  if (!tokenId) return null
  return policies.find((policy) => (
    policy.decision === 'non_identity'
    && (policy.include || []).some(
      (rule) => String(rule?.service_token?.token_id || '') === String(tokenId),
    )
  )) || null
}

const before = await accountState(read)
const secretBundle = loadSecretBundle()
const humanPolicy = exactEmailPolicy(before.humanPolicies)
const runnerPolicy = exactServiceTokenPolicy(before.runnerPolicies, before.serviceToken?.id)
const expectedTunnelTarget = `${tunnelId}.cfargotunnel.com`

if (!before.tunnel?.id || before.tunnel.id !== tunnelId || before.tunnel.deleted_at) {
  throw new Error(`active tunnel not found: ${tunnelId}`)
}
if (
  before.dnsRecord
  && (
    String(before.dnsRecord.content || '').toLowerCase() !== expectedTunnelTarget
    || before.dnsRecord.proxied !== true
  )
) {
  throw new Error(`${runnerDomain} already has an incompatible DNS record`)
}
if (before.serviceToken && !secretBundle && commit) {
  throw new Error(
    `service token "${tokenName}" exists but ${secretFile} is missing; refusing an implicit credential rotation`,
  )
}
if (
  before.serviceToken
  && secretBundle
  && String(secretBundle.serviceTokenId) !== String(before.serviceToken.id)
) {
  throw new Error('local runner credential bundle does not match the existing Access service token')
}
if (!before.serviceToken && secretBundle) {
  throw new Error('local runner credential bundle exists but its Access service token does not')
}

log.info(`D1 database: ${databaseName} ${before.database ? '(exists)' : '(create)'}`)
log.info(`Human Access app: ${domain} ${before.humanApp ? '(exists)' : '(create)'}`)
log.info(`Human Access policy: ${emails.join(', ')} ${humanPolicy ? '(exists)' : '(create)'}`)
log.info(`Runner service token: ${tokenName} ${before.serviceToken ? '(exists)' : '(create)'}`)
log.info(`Runner Access app: ${runnerDomain} ${before.runnerApp ? '(exists)' : '(create)'}`)
log.info(`Runner service-token policy: ${runnerPolicy ? '(exists)' : '(create)'}`)
log.info(`Tunnel DNS: ${runnerDomain} -> ${expectedTunnelTarget} ${before.dnsRecord ? '(exists)' : '(create)'}`)
log.info(`Credential bundle: ${secretFile} ${secretBundle ? '(exists)' : '(create once)'}`)

if (!commit) {
  log.warn('DRY-RUN - nothing changed. Re-run with --commit to apply.')
  audit({
    action,
    status: 'DRY_RUN',
    databaseName,
    domain,
    runnerDomain,
    zoneId,
    tunnelId,
    emails,
    databaseExists: Boolean(before.database),
    humanAppExists: Boolean(before.humanApp),
    humanPolicyExists: Boolean(humanPolicy),
    serviceTokenExists: Boolean(before.serviceToken),
    runnerAppExists: Boolean(before.runnerApp),
    runnerPolicyExists: Boolean(runnerPolicy),
    dnsRecordExists: Boolean(before.dnsRecord),
    secretBundleExists: Boolean(secretBundle),
  })
  process.exit(0)
}

const cf = bootEdit(action, {
  databaseName,
  domain,
  runnerDomain,
  zoneId,
  tunnelId,
  emails,
})

let database = before.database
if (!database) {
  const response = await cf.raw('POST', `/accounts/${accountId}/d1/database`, {
    body: {
      name: databaseName,
      primary_location_hint: 'apac',
      read_replication: { mode: 'disabled' },
    },
  })
  database = response.result
  audit({ action, status: 'COMMITTED', step: 'create-d1', databaseName, databaseId: database?.uuid })
  log.ok(`created D1 database ${databaseName}`)
}

let humanApp = before.humanApp
if (!humanApp) {
  const response = await cf.raw('POST', `/accounts/${accountId}/access/apps`, {
    body: {
      name: appName,
      domain,
      type: 'self_hosted',
      session_duration: '24h',
      app_launcher_visible: false,
      allow_authenticate_via_warp: false,
      destinations: [{ type: 'public', uri: domain }],
      policies: [{
        name: 'Allow named Deep Research members',
        decision: 'allow',
        precedence: 1,
        include: emails.map((email) => ({ email: { email } })),
      }],
    },
  })
  humanApp = response.result
  audit({ action, status: 'COMMITTED', step: 'create-human-access-app', domain, applicationId: humanApp?.id })
  log.ok(`created human Access app for ${domain}`)
} else if (!humanPolicy) {
  const response = await cf.raw('POST', `/accounts/${accountId}/access/apps/${humanApp.id}/policies`, {
    body: {
      name: 'Allow named Deep Research members',
      decision: 'allow',
      precedence: 1,
      include: emails.map((email) => ({ email: { email } })),
    },
  })
  audit({
    action,
    status: 'COMMITTED',
    step: 'create-human-access-policy',
    applicationId: humanApp.id,
    policyId: response.result?.id,
  })
  log.ok(`created exact-email Access policy for ${domain}`)
}

let serviceToken = before.serviceToken
let credentials = secretBundle
if (!serviceToken) {
  mkdirSync(dirname(secretFile), { recursive: true, mode: 0o700 })
  const response = await cf.raw('POST', `/accounts/${accountId}/access/service_tokens`, {
    body: { name: tokenName, duration: '8760h' },
  })
  serviceToken = response.result
  credentials = {
    serviceTokenId: String(serviceToken.id),
    runnerAccessClientId: String(serviceToken.client_id),
    runnerAccessClientSecret: String(serviceToken.client_secret),
    runnerHmacSecret: randomBytes(32).toString('base64url'),
    createdAt: new Date().toISOString(),
    runnerDomain,
  }
  writeSecretBundle(credentials)
  audit({
    action,
    status: 'COMMITTED',
    step: 'create-runner-service-token',
    serviceTokenId: serviceToken.id,
    tokenName,
    secretFile,
  })
  log.ok(`created runner service token and stored its credentials in ${secretFile}`)
}

let runnerApp = before.runnerApp
if (!runnerApp) {
  const response = await cf.raw('POST', `/accounts/${accountId}/access/apps`, {
    body: {
      name: `${appName} Runner`,
      domain: runnerDomain,
      type: 'self_hosted',
      session_duration: '24h',
      app_launcher_visible: false,
      allow_authenticate_via_warp: false,
      destinations: [{ type: 'public', uri: runnerDomain }],
      policies: [{
        name: 'Allow Deep Research Worker service token',
        decision: 'non_identity',
        precedence: 1,
        include: [{ service_token: { token_id: serviceToken.id } }],
      }],
    },
  })
  runnerApp = response.result
  audit({
    action,
    status: 'COMMITTED',
    step: 'create-runner-access-app',
    runnerDomain,
    applicationId: runnerApp?.id,
  })
  log.ok(`created service-token-only Access app for ${runnerDomain}`)
} else if (!runnerPolicy) {
  const response = await cf.raw('POST', `/accounts/${accountId}/access/apps/${runnerApp.id}/policies`, {
    body: {
      name: 'Allow Deep Research Worker service token',
      decision: 'non_identity',
      precedence: 1,
      include: [{ service_token: { token_id: serviceToken.id } }],
    },
  })
  audit({
    action,
    status: 'COMMITTED',
    step: 'create-runner-access-policy',
    applicationId: runnerApp.id,
    policyId: response.result?.id,
  })
  log.ok(`created service-token-only Access policy for ${runnerDomain}`)
}

if (!before.dnsRecord) {
  const response = await cf.raw('POST', `/zones/${zoneId}/dns_records`, {
    body: {
      type: 'CNAME',
      name: runnerDomain,
      content: expectedTunnelTarget,
      proxied: true,
      ttl: 1,
      comment: 'Private GattyWorks Deep Research runner through Cloudflare Tunnel',
    },
  })
  audit({
    action,
    status: 'COMMITTED',
    step: 'create-runner-dns',
    zoneId,
    runnerDomain,
    dnsRecordId: response.result?.id,
  })
  log.ok(`created proxied tunnel CNAME for ${runnerDomain}`)
}

const after = await accountState(cf)
const verifiedHumanPolicy = exactEmailPolicy(after.humanPolicies)
const verifiedRunnerPolicy = exactServiceTokenPolicy(after.runnerPolicies, after.serviceToken?.id)
if (
  !after.database?.uuid
  || !after.humanApp?.id
  || !after.humanApp?.aud
  || !verifiedHumanPolicy
  || !after.serviceToken?.id
  || !after.runnerApp?.id
  || !verifiedRunnerPolicy
  || !after.dnsRecord?.id
  || !credentials
) {
  audit({ action, status: 'FAILED', step: 'verify', databaseName, domain, runnerDomain })
  throw new Error('Deep Research provisioning verification failed')
}

const teamDomain = String(after.organization?.auth_domain || '')
  .replace(/^https?:\/\//, '')
  .replace(/\/.*$/, '')

audit({
  action,
  status: 'COMMITTED',
  step: 'verified',
  databaseName,
  databaseId: after.database.uuid,
  domain,
  humanApplicationId: after.humanApp.id,
  humanAccessAud: after.humanApp.aud,
  runnerDomain,
  runnerApplicationId: after.runnerApp.id,
  serviceTokenId: after.serviceToken.id,
  dnsRecordId: after.dnsRecord.id,
})

log.ok('Deep Research Cloudflare control plane provisioned and verified.')
console.log(JSON.stringify({
  databaseName,
  databaseId: after.database.uuid,
  accessApplicationId: after.humanApp.id,
  accessAud: after.humanApp.aud,
  accessTeamDomain: teamDomain || null,
  domain,
  runnerAccessApplicationId: after.runnerApp.id,
  runnerDomain,
  runnerServiceTokenId: after.serviceToken.id,
  tunnelId,
  emails,
  secretFile,
}, null, 2))
