#!/usr/bin/env node
/**
 * Guarded action: provision the Social Desk control plane.
 *
 * Creates, idempotently:
 * - a caller-named D1 database
 * - a Cloudflare Access self-hosted app for a caller-supplied domain
 * - exact-email Allow policy for the configured operators
 *
 * This action does not deploy the Worker, attach its custom domain, apply D1
 * migrations, or install Meta secrets. Those steps use the IDs emitted here.
 *
 * Pass --emails=<comma-separated-addresses>, or set
 * SOCIAL_DESK_ALLOWED_EMAILS in the gitignored .env file.
 * DRY-RUN by default. Add --commit to mutate the account.
 */
import { join } from 'node:path'
import { DIRS } from '../lib/paths.mjs'
import { loadEnv } from '../lib/util.mjs'
import { makeClient, resolveAccountId } from '../lib/cf.mjs'
import { bootEdit, parseArgs, log, audit } from './_lib.mjs'

const { args, commit } = parseArgs(process.argv.slice(2))
const action = 'social-desk-provision'
const databaseName = String(args.database || '')
const domain = String(args.domain || '').toLowerCase()
const appName = String(args.name || 'Social Desk')
loadEnv(join(DIRS.root, '.env'))
const emails = String(args.emails || process.env.SOCIAL_DESK_ALLOWED_EMAILS || '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean)

if (!databaseName || !domain) {
  log.err('usage: --database=<d1-name> --domain=<access-domain> [--name=<app-name>] [--emails=<addresses>] [--commit]')
  process.exit(1)
}
if (!/^[a-z0-9.-]+$/.test(domain) || !domain.includes('.')) {
  log.err('invalid --domain=<access-domain>')
  process.exit(1)
}
if (!/^[a-z0-9-]+$/.test(databaseName)) {
  log.err('invalid --database=<d1-name>')
  process.exit(1)
}
if (!emails.length || emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
  log.err('provide valid operator addresses with --emails=<email1,email2> or SOCIAL_DESK_ALLOWED_EMAILS')
  process.exit(1)
}

const read = makeClient({ mode: 'read' })
const accountId = await resolveAccountId(read)

async function accountState(client) {
  const [databases, applications, organization] = await Promise.all([
    client.getAll(`/accounts/${accountId}/d1/database`, { query: { per_page: 100 } }),
    client.getAll(`/accounts/${accountId}/access/apps`, { query: { per_page: 100 } }),
    client.get(`/accounts/${accountId}/access/organizations`).catch(() => null),
  ])
  const database = databases.find((item) => item.name === databaseName) || null
  const application = applications.find((item) => String(item.domain || '').toLowerCase() === domain) || null
  let policies = []
  if (application?.id) {
    policies = await client.getAll(
      `/accounts/${accountId}/access/apps/${application.id}/policies`,
      { query: { per_page: 100 } },
    ).catch(() => [])
  }
  return { database, application, organization, policies }
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

const before = await accountState(read)
const existingPolicy = exactEmailPolicy(before.policies)

log.info(`D1 database: ${databaseName} ${before.database ? '(exists)' : '(create)'}`)
log.info(`Access app: ${appName} at ${domain} ${before.application ? '(exists)' : '(create)'}`)
log.info(`Access Allow policy: ${emails.join(', ')} ${existingPolicy ? '(exists)' : '(create)'}`)
log.info('Worker deploy, custom domain, D1 migrations, and Meta secrets are separate guarded steps.')

if (!commit) {
  log.warn('DRY-RUN - nothing changed. Re-run with --commit to apply.')
  audit({
    action,
    status: 'DRY_RUN',
    databaseName,
    domain,
    emails,
    databaseExists: Boolean(before.database),
    applicationExists: Boolean(before.application),
    policyExists: Boolean(existingPolicy),
  })
} else {
  const cf = bootEdit(action, { databaseName, domain, emails })

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

  let application = before.application
  if (!application) {
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
          name: 'Allow named Social Desk members',
          decision: 'allow',
          precedence: 1,
          include: emails.map((email) => ({ email: { email } })),
        }],
      },
    })
    application = response.result
    audit({ action, status: 'COMMITTED', step: 'create-access-app', domain, applicationId: application?.id })
    log.ok(`created Access app for ${domain}`)
  } else if (!existingPolicy) {
    const response = await cf.raw(
      'POST',
      `/accounts/${accountId}/access/apps/${application.id}/policies`,
      {
        body: {
          name: 'Allow named Social Desk members',
          decision: 'allow',
          precedence: 1,
          include: emails.map((email) => ({ email: { email } })),
        },
      },
    )
    audit({
      action,
      status: 'COMMITTED',
      step: 'create-access-policy',
      domain,
      applicationId: application.id,
      policyId: response.result?.id,
    })
    log.ok(`created exact-email Access policy for ${domain}`)
  }

  const after = await accountState(cf)
  const policy = exactEmailPolicy(after.policies)
  if (!after.database?.uuid || !after.application?.id || !after.application?.aud || !policy) {
    audit({ action, status: 'FAILED', step: 'verify', databaseName, domain })
    throw new Error('Provisioning verification failed.')
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
    applicationId: after.application.id,
    accessAud: after.application.aud,
    policyId: policy.id,
  })

  log.ok('Social Desk control plane provisioned and verified.')
  console.log(JSON.stringify({
    databaseName,
    databaseId: after.database.uuid,
    accessApplicationId: after.application.id,
    accessAud: after.application.aud,
    accessTeamDomain: teamDomain || null,
    domain,
    emails,
  }, null, 2))
}
