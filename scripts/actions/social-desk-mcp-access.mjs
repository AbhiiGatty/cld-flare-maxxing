#!/usr/bin/env node
/**
 * Guarded action: create the narrow Cloudflare Access exception used by the
 * Social Desk MCP endpoint.
 *
 * The dashboard remains behind its existing exact-email Access application.
 * Only the caller-supplied /mcp* path bypasses Access so non-browser clients
 * can reach Social Desk's own hashed bearer-token authentication.
 *
 * DRY-RUN by default. Add --commit to mutate the account.
 */
import { DIRS } from '../lib/paths.mjs'
import { loadEnv } from '../lib/util.mjs'
import { makeClient, resolveAccountId } from '../lib/cf.mjs'
import { bootEdit, parseArgs, log, audit } from './_lib.mjs'

const { args, commit } = parseArgs(process.argv.slice(2))
const action = 'social-desk-mcp-access'
const domain = String(args.domain || '').toLowerCase()
const appName = String(args.name || 'Social Desk MCP')

if (!domain) {
  log.err('usage: --domain=<hostname/mcp*> [--name=<app-name>] [--commit]')
  process.exit(1)
}
if (!/^[a-z0-9.-]+\/mcp\*$/.test(domain) || !domain.includes('.')) {
  log.err('domain must be an exact hostname followed by /mcp*')
  process.exit(1)
}

loadEnv(DIRS.env)
const read = makeClient({ mode: 'read' })
const accountId = await resolveAccountId(read)

async function accountState(client) {
  const applications = await client.getAll(`/accounts/${accountId}/access/apps`, {
    query: { per_page: 100 },
  })
  const application = applications.find(
    (item) => String(item.domain || '').toLowerCase() === domain,
  ) || null
  let policies = []
  if (application?.id) {
    policies = await client.getAll(
      `/accounts/${accountId}/access/apps/${encodeURIComponent(application.id)}/policies`,
      { query: { per_page: 100 } },
    ).catch(() => [])
  }
  return { application, policies }
}

function isEveryoneBypass(policy) {
  return policy?.decision === 'bypass'
    && (policy.include || []).some((rule) => rule?.everyone != null)
}

const before = await accountState(read)
if (before.application && before.application.type !== 'self_hosted') {
  throw new Error(`Existing Access application at ${domain} is not self-hosted.`)
}
const existingPolicy = before.policies.find(isEveryoneBypass) || null

log.info(`Access app: ${appName} at ${domain} ${before.application ? '(exists)' : '(create)'}`)
log.info(`Everyone Bypass policy: ${existingPolicy ? '(exists)' : '(create)'}`)
log.info('The bypass is path-scoped. Social Desk bearer-token authentication remains required at the Worker.')

if (!commit) {
  log.warn('DRY-RUN - nothing changed. Re-run with --commit to apply.')
  audit({
    action,
    status: 'DRY_RUN',
    domain,
    applicationExists: Boolean(before.application),
    policyExists: Boolean(existingPolicy),
  })
}

if (commit) await provision()

async function provision() {
const cf = bootEdit(action, { domain, appName })
let application = before.application
if (!application) {
  const response = await cf.raw('POST', `/accounts/${accountId}/access/apps`, {
    body: {
      name: appName,
      domain,
      type: 'self_hosted',
      app_launcher_visible: false,
      allow_authenticate_via_warp: false,
      destinations: [{ type: 'public', uri: domain }],
      policies: [{
        name: 'Bypass Access for Social Desk MCP',
        decision: 'bypass',
        precedence: 1,
        include: [{ everyone: {} }],
      }],
    },
  })
  application = response.result
  audit({
    action,
    status: 'COMMITTED',
    step: 'create-access-app',
    domain,
    applicationId: application?.id,
  })
  log.ok(`created path-scoped Access application for ${domain}`)
} else if (!existingPolicy) {
  const response = await cf.raw(
    'POST',
    `/accounts/${accountId}/access/apps/${encodeURIComponent(application.id)}/policies`,
    {
      body: {
        name: 'Bypass Access for Social Desk MCP',
        decision: 'bypass',
        precedence: 1,
        include: [{ everyone: {} }],
      },
    },
  )
  audit({
    action,
    status: 'COMMITTED',
    step: 'create-bypass-policy',
    domain,
    applicationId: application.id,
    policyId: response.result?.id,
  })
  log.ok(`created Everyone Bypass policy for ${domain}`)
}

const after = await accountState(cf)
const policy = after.policies.find(isEveryoneBypass)
if (!after.application?.id || !policy?.id) {
  audit({ action, status: 'FAILED', step: 'verify', domain })
  throw new Error('Social Desk MCP Access verification failed.')
}

audit({
  action,
  status: 'COMMITTED',
  step: 'verified',
  domain,
  applicationId: after.application.id,
  policyId: policy.id,
})
log.ok('Social Desk MCP Access path provisioned and verified.')
console.log(JSON.stringify({
  domain,
  accessApplicationId: after.application.id,
  policyId: policy.id,
}, null, 2))
}
