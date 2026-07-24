#!/usr/bin/env node
/** Friendly preflight: checks env + token, creates .env from the example,
 *  and verifies the read token can reach the API. */
import { existsSync, copyFileSync } from 'node:fs'
import { DIRS, PORTABLE } from './lib/paths.mjs'
import { ensureDir, loadEnv, log } from './lib/util.mjs'

const envPath = DIRS.env
ensureDir(DIRS.root)
if (!existsSync(envPath) && existsSync(DIRS.envExample)) {
  copyFileSync(DIRS.envExample, envPath)
  log.info(`created ${envPath} from the Cloudflare env template; add CF_READ_TOKEN, then re-run.`)
}
loadEnv(envPath)

const token = process.env.CF_READ_TOKEN || process.env.CF_API_TOKEN
if (!token) {
  log.err(`CF_READ_TOKEN is not set in ${envPath}. Use Cloudflare's Read all resources token template.`)
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
  log.info(`next: ${PORTABLE ? 'run the portable refresh command' : 'npm run refresh'}`)
  log.info(`then: ${PORTABLE ? 'run the portable dashboard command' : 'npm run dashboard'}`)
} catch (e) {
  log.err('token check failed: ' + e.message)
  log.warn('If you see permission errors, your read token may be missing scopes (docs/TOKEN-SETUP.md).')
  process.exit(1)
}
