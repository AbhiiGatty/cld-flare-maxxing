#!/usr/bin/env node
/**
 * Guarded action: add the fixed GazetteIntel Google OAuth client to Access.
 *
 * The Google credential JSON stays local. The action sends only its client ID
 * and secret to Cloudflare's encrypted identity-provider configuration.
 * DRY-RUN by default; --commit mutates.
 */
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { DIRS } from '../lib/paths.mjs'
import { loadEnv } from '../lib/util.mjs'
import { makeClient, resolveAccountId } from '../lib/cf.mjs'
import { bootEdit, parseArgs, log, audit } from './_lib.mjs'

const action = 'gazetteintel-google-sso'
const providerName = 'GazetteIntel Google'
const callback = 'https://frontend-6wo-pages.cloudflareaccess.com/cdn-cgi/access/callback'
const { args, commit } = parseArgs(process.argv.slice(2))
const credentialsPath = String(args.credentials || '')

if (!credentialsPath || !isAbsolute(credentialsPath) || !credentialsPath.toLowerCase().endsWith('.json')) {
  log.err('usage: --credentials=<absolute-google-client-json> [--commit]')
  process.exit(1)
}
if (!existsSync(credentialsPath)) {
  log.err('Google OAuth credential file not found')
  process.exit(1)
}

loadEnv(DIRS.env)
const read = makeClient({ mode: 'read' })
const accountId = await resolveAccountId(read)

async function findProvider(client) {
  const providers = await client.getAll(`/accounts/${accountId}/access/identity_providers`, { query: { per_page: 100 } })
  return providers.find((provider) => provider.name === providerName) || null
}

const before = await findProvider(read)
log.info(`Google SSO provider: ${providerName} ${before ? '(exists)' : '(create)'}`)
log.info(`OAuth callback: ${callback}`)
log.info('The client secret is never printed or written to the audit log.')

if (!commit) {
  log.warn('DRY-RUN - nothing changed. Re-run with --commit to apply.')
  audit({ action, status: 'DRY_RUN', providerName, callback, providerExists: Boolean(before) })
} else {
  const cf = bootEdit(action, { providerName, callback })
  let provider = before
  if (!provider) {
    const credentials = JSON.parse(readFileSync(credentialsPath, 'utf8'))
    const web = credentials?.web
    if (!web?.client_id || !web?.client_secret || !Array.isArray(web.redirect_uris) || !web.redirect_uris.includes(callback)) {
      throw new Error('Credential JSON is not the approved Cloudflare Access web client.')
    }
    const response = await cf.raw('POST', `/accounts/${accountId}/access/identity_providers`, {
      body: {
        name: providerName,
        type: 'oidc',
        config: {
          client_id: web.client_id,
          client_secret: web.client_secret,
          auth_url: 'https://accounts.google.com/o/oauth2/v2/auth',
          token_url: 'https://oauth2.googleapis.com/token',
          certs_url: 'https://www.googleapis.com/oauth2/v3/certs',
          pkce_enabled: true,
          email_claim_name: 'email',
          scopes: ['openid', 'email', 'profile'],
        },
      },
    })
    provider = response.result
    audit({ action, status: 'COMMITTED', step: 'create-google-idp', providerName, providerId: provider?.id })
    log.ok(`created Access identity provider ${providerName}`)
  }

  const after = await findProvider(cf)
  if (!after?.id || after.type !== 'oidc') {
    audit({ action, status: 'FAILED', step: 'verify', providerName })
    throw new Error('Google SSO provider verification failed.')
  }
  audit({ action, status: 'COMMITTED', step: 'verified', providerName, providerId: after.id, type: after.type })
  log.ok('GazetteIntel Google SSO provider exists and is verified.')
  console.log(JSON.stringify({ providerName, providerId: after.id, type: after.type, callback }, null, 2))
}
