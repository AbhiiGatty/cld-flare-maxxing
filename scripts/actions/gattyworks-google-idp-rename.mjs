#!/usr/bin/env node
/**
 * Guarded action: rename the Access identity provider `GazetteIntel Google` to
 * `GattyWorks Google` for internal GattyWorks services.
 *
 * Cloudflare's identity-provider PUT replaces the whole record, and the stored
 * OIDC client secret is never returned by GET, so the rename re-sends the full
 * OIDC config from the same local Google credential JSON that created the
 * provider (see gazetteintel-google-sso.mjs). The secret is never printed or
 * audited. Applications reference the provider by id, so nothing else changes.
 *
 * DRY-RUN by default (reads only; --credentials optional). --commit requires
 * --credentials=<absolute-google-client-json>.
 */
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { DIRS } from '../lib/paths.mjs'
import { loadEnv } from '../lib/util.mjs'
import { makeClient, resolveAccountId } from '../lib/cf.mjs'
import { audit, bootEdit, log, parseArgs } from './_lib.mjs'

const action = 'gattyworks-google-idp-rename'
const fromName = 'GazetteIntel Google'
const toName = 'GattyWorks Google'
const callback = 'https://frontend-6wo-pages.cloudflareaccess.com/cdn-cgi/access/callback'
const { args, commit } = parseArgs(process.argv.slice(2))
const credentialsPath = String(args.credentials || '')

if (credentialsPath && (!isAbsolute(credentialsPath) || !credentialsPath.toLowerCase().endsWith('.json') || !existsSync(credentialsPath))) {
  log.err('usage: [--credentials=<absolute-google-client-json>] [--commit]  (credentials required with --commit)')
  process.exit(1)
}

loadEnv(DIRS.env)
const read = makeClient({ mode: 'read' })
const accountId = await resolveAccountId(read)

async function providers(client) {
  const list = await client.getAll(`/accounts/${accountId}/access/identity_providers`, { query: { per_page: 100 } })
  return { from: list.find((p) => p.name === fromName) || null, to: list.find((p) => p.name === toName) || null }
}

const before = await providers(read)
if (before.to && !before.from) {
  log.ok(`${toName} already exists (${before.to.id}). Nothing to do.`)
  process.exit(0)
}
if (!before.from) throw new Error(`${fromName} was not found`)
if (before.to) throw new Error(`both ${fromName} and ${toName} exist; resolve manually`)
if (before.from.type !== 'oidc') throw new Error(`${fromName} is ${before.from.type}, expected oidc`)

log.info(`Identity provider: ${fromName} (${before.from.id}, oidc) -> rename to ${toName}`)
log.info('OIDC config is re-sent from the local Google credential JSON; the client secret is never printed or audited.')
log.info('Access applications reference the provider by id and are not modified.')

if (!commit) {
  log.warn('DRY-RUN - nothing changed. Re-run with --credentials=<json> --commit to apply.')
  audit({ action, status: 'DRY_RUN', providerId: before.from.id, fromName, toName })
  process.exit(0)
}
if (!credentialsPath) {
  log.err('--commit requires --credentials=<absolute-google-client-json>')
  process.exit(1)
}

const cf = bootEdit(action, { providerId: before.from.id, fromName, toName })
const credentials = JSON.parse(readFileSync(credentialsPath, 'utf8'))
const web = credentials?.web
if (!web?.client_id || !web?.client_secret || !Array.isArray(web.redirect_uris) || !web.redirect_uris.includes(callback)) {
  throw new Error('Credential JSON is not the approved Cloudflare Access web client.')
}
await cf.raw('PUT', `/accounts/${accountId}/access/identity_providers/${before.from.id}`, {
  body: {
    name: toName,
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
audit({ action, status: 'COMMITTED', step: 'rename-idp', providerId: before.from.id, toName })

const after = await providers(cf)
if (!after.to || after.to.id !== before.from.id || after.from) {
  audit({ action, status: 'FAILED', step: 'verify', providerId: before.from.id })
  throw new Error('identity provider rename verification failed')
}
audit({ action, status: 'COMMITTED', step: 'verified', providerId: after.to.id, toName })
log.ok(`${toName} (${after.to.id}) is verified.`)
