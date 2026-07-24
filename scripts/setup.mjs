#!/usr/bin/env node
/** Friendly preflight: checks env + token, creates .env from the example,
 *  and verifies the read token can reach the API. */
import { join } from 'node:path'
import { existsSync, copyFileSync } from 'node:fs'
import { DIRS } from './lib/paths.mjs'
import { loadEnv, log } from './lib/util.mjs'

const envPath = join(DIRS.root, '.env')
if (!existsSync(envPath) && existsSync(join(DIRS.root, '.env.example'))) {
  copyFileSync(join(DIRS.root, '.env.example'), envPath)
  log.info('created .env from .env.example — add your CF_READ_TOKEN, then re-run.')
}
loadEnv(envPath)

const token = process.env.CF_READ_TOKEN || process.env.CF_API_TOKEN
if (!token) {
  log.err('CF_READ_TOKEN is not set in .env. See docs/TOKEN-SETUP.md for exact scopes.')
  process.exit(1)
}

const ver = process.versions.node.split('.').map(Number)
const supportedNode = (ver[0] === 20 && ver[1] >= 19) || ver[0] > 22 || (ver[0] === 22 && ver[1] >= 12)
if (!supportedNode) log.warn(`Node ${process.versions.node} detected; this project targets Node 20.19+ or 22.12+.`)

const { makeClient, resolveAccountId } = await import('./lib/cf.mjs')
try {
  const cf = makeClient({ mode: 'read' })
  const verify = await cf.raw('GET', '/user/tokens/verify').catch(() => null)
  if (verify?.result?.status) log.ok(`token verified — status: ${verify.result.status}`)
  const acct = await resolveAccountId(cf)
  log.ok(`reached Cloudflare. account: ${acct}`)
  log.info('next: npm run refresh   (snapshot → report → betas → dashboard data)')
  log.info('then: npm run dashboard  (opens the unified dashboard)')
} catch (e) {
  log.err('token check failed: ' + e.message)
  log.warn('If you see permission errors, your read token may be missing scopes (docs/TOKEN-SETUP.md).')
  process.exit(1)
}
