#!/usr/bin/env node
/**
 * Guarded action: provision the fixed GazetteIntel storage and Access boundary.
 *
 * Creates, idempotently:
 * - D1 database gazette-ledger
 * - private R2 buckets gazette-pdfs and gazette-ocr-sidecar
 * - one multi-domain Access application for app.gazetteintel.com and
 *   api.gazetteintel.com, with exact-email Allow policy
 *
 * Worker/Pages deploys, DNS, migrations, service credentials, and IdP secrets
 * remain separate guarded actions. DRY-RUN by default; --commit mutates.
 */
import { DIRS } from '../lib/paths.mjs'
import { loadEnv } from '../lib/util.mjs'
import { makeClient, resolveAccountId } from '../lib/cf.mjs'
import { bootEdit, parseArgs, log, audit } from './_lib.mjs'

const action = 'gazetteintel-provision'
const databaseName = 'gazette-ledger'
const bucketNames = ['gazette-pdfs', 'gazette-ocr-sidecar']
const appName = 'GazetteIntel beta'
const appHost = 'app.gazetteintel.com'
const apiHost = 'api.gazetteintel.com'
const domains = [appHost, apiHost]
const { args, commit } = parseArgs(process.argv.slice(2))

loadEnv(DIRS.env)
const emails = String(args.emails || process.env.GAZETTEINTEL_ALLOWED_EMAILS || '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean)

if (!emails.length || emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
  log.err('provide valid operators with --emails=<email1,email2> or GAZETTEINTEL_ALLOWED_EMAILS')
  process.exit(1)
}

const read = makeClient({ mode: 'read' })
const accountId = await resolveAccountId(read)

const destinationUris = (application) => new Set(
  (application?.destinations || []).map((destination) => String(destination?.uri || '').toLowerCase()),
)

async function accountState(client) {
  const [databases, buckets, applications, organization] = await Promise.all([
    client.getAll(`/accounts/${accountId}/d1/database`, { query: { per_page: 100 } }),
    client.getCursor(`/accounts/${accountId}/r2/buckets`, { query: { per_page: 100 } }),
    client.getAll(`/accounts/${accountId}/access/apps`, { query: { per_page: 100 } }),
    client.get(`/accounts/${accountId}/access/organizations`).catch(() => null),
  ])
  const database = databases.find((item) => item.name === databaseName) || null
  const existingBuckets = new Map(buckets.map((bucket) => [bucket.name, bucket]))
  const application = applications.find((item) => {
    const uris = destinationUris(item)
    return domains.every((domain) => uris.has(domain)) && uris.size === domains.length
  }) || null
  const policies = application?.id
    ? await client.getAll(`/accounts/${accountId}/access/apps/${application.id}/policies`, { query: { per_page: 100 } }).catch(() => [])
    : []
  return { database, existingBuckets, application, organization, policies }
}

function exactEmailPolicy(policies) {
  return policies.find((policy) => {
    if (policy.decision !== 'allow') return false
    const found = new Set((policy.include || [])
      .map((rule) => rule?.email?.email)
      .filter(Boolean)
      .map((email) => String(email).toLowerCase()))
    return emails.every((email) => found.has(email)) && found.size === emails.length
  }) || null
}

const before = await accountState(read)
const existingPolicy = exactEmailPolicy(before.policies)

log.info(`D1 database: ${databaseName} ${before.database ? '(exists)' : '(create)'}`)
for (const bucketName of bucketNames) {
  log.info(`private R2 bucket: ${bucketName} ${before.existingBuckets.has(bucketName) ? '(exists)' : '(create)'}`)
}
log.info(`Access app: ${appName} at ${domains.join(' + ')} ${before.application ? '(exists)' : '(create)'}`)
log.info(`Access Allow policy: ${emails.join(', ')} ${existingPolicy ? '(exists)' : '(create)'}`)
log.info('Access OPTIONS bypass is enabled so the Worker can enforce strict CORS; non-OPTIONS requests remain protected.')

if (!commit) {
  log.warn('DRY-RUN - nothing changed. Re-run with --commit to apply.')
  audit({
    action,
    status: 'DRY_RUN',
    databaseName,
    bucketNames,
    domains,
    emails,
    databaseExists: Boolean(before.database),
    existingBuckets: bucketNames.filter((name) => before.existingBuckets.has(name)),
    applicationExists: Boolean(before.application),
    policyExists: Boolean(existingPolicy),
  })
} else {
  const cf = bootEdit(action, { databaseName, bucketNames, domains, emails })

  if (!before.database) {
    const response = await cf.raw('POST', `/accounts/${accountId}/d1/database`, {
      body: { name: databaseName, primary_location_hint: 'apac', read_replication: { mode: 'disabled' } },
    })
    audit({ action, status: 'COMMITTED', step: 'create-d1', databaseId: response.result?.uuid })
    log.ok(`created D1 database ${databaseName}`)
  }

  for (const bucketName of bucketNames) {
    if (before.existingBuckets.has(bucketName)) continue
    await cf.raw('POST', `/accounts/${accountId}/r2/buckets`, { body: { name: bucketName } })
    audit({ action, status: 'COMMITTED', step: 'create-r2', bucketName })
    log.ok(`created private R2 bucket ${bucketName}`)
  }

  let application = before.application
  if (!application) {
    const response = await cf.raw('POST', `/accounts/${accountId}/access/apps`, {
      body: {
        name: appName,
        domain: appHost,
        type: 'self_hosted',
        session_duration: '24h',
        app_launcher_visible: false,
        allow_authenticate_via_warp: false,
        options_preflight_bypass: true,
        destinations: domains.map((uri) => ({ type: 'public', uri })),
        policies: [{
          name: 'Allow named GazetteIntel beta members',
          decision: 'allow',
          precedence: 1,
          include: emails.map((email) => ({ email: { email } })),
        }],
      },
    })
    application = response.result
    audit({ action, status: 'COMMITTED', step: 'create-access-app', applicationId: application?.id, domains })
    log.ok(`created multi-domain Access app for ${domains.join(' + ')}`)
  } else if (!existingPolicy) {
    const response = await cf.raw('POST', `/accounts/${accountId}/access/apps/${application.id}/policies`, {
      body: {
        name: 'Allow named GazetteIntel beta members',
        decision: 'allow',
        precedence: 1,
        include: emails.map((email) => ({ email: { email } })),
      },
    })
    audit({ action, status: 'COMMITTED', step: 'create-access-policy', applicationId: application.id, policyId: response.result?.id })
    log.ok('created exact-email Access policy')
  }

  const after = await accountState(cf)
  const policy = exactEmailPolicy(after.policies)
  const missingBuckets = bucketNames.filter((name) => !after.existingBuckets.has(name))
  const uris = destinationUris(after.application)
  if (!after.database?.uuid || missingBuckets.length || !after.application?.id || !after.application?.aud || !policy || !domains.every((domain) => uris.has(domain))) {
    audit({ action, status: 'FAILED', step: 'verify', missingBuckets })
    throw new Error('GazetteIntel provisioning verification failed.')
  }

  const teamDomain = String(after.organization?.auth_domain || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  audit({
    action,
    status: 'COMMITTED',
    step: 'verified',
    databaseId: after.database.uuid,
    bucketNames,
    applicationId: after.application.id,
    accessAud: after.application.aud,
    policyId: policy.id,
  })
  log.ok('GazetteIntel control plane provisioned and verified.')
  console.log(JSON.stringify({
    databaseName,
    databaseId: after.database.uuid,
    bucketNames,
    accessApplicationId: after.application.id,
    accessAud: after.application.aud,
    accessTeamDomain: teamDomain || null,
    domains,
    emails,
  }, null, 2))
}
