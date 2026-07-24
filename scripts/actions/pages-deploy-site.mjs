#!/usr/bin/env node
/**
 * Guarded action: deploy site/ (the public landing page) to Cloudflare Pages
 * and attach its custom domain.
 *
 * DRY-RUN by default — checks whether the Pages project already exists and
 * prints the exact deploy + domain-attach plan. Nothing mutated, no break-glass
 * required, no wrangler invocation.
 *
 * --commit runs the pinned local Wrangler executable (using CF_EDIT_TOKEN as
 * CLOUDFLARE_API_TOKEN) then attaches the custom domain via the Pages API.
 * Cloudflare auto-creates the DNS record for the domain since the zone is on
 * the same account — no separate DNS action needed.
 *
 * Flags: [--project=<name>] [--domain=<host>] [--commit]
 *
 *   node scripts/actions/pages-deploy-site.mjs                 # dry-run
 *   CF_ALLOW_DESTRUCTIVE=YES_I_AM_SURE node scripts/actions/pages-deploy-site.mjs --commit
 */
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { DIRS } from '../lib/paths.mjs'
import { loadEnv, log } from '../lib/util.mjs'
import { makeClient, resolveAccountId } from '../lib/cf.mjs'
import { bootEdit, commandEnv, parseArgs, audit, wranglerExecutable } from './_lib.mjs'
import { writeVersion } from '../write-version.mjs'

async function main() {
const { args, commit } = parseArgs(process.argv.slice(2))
const action = 'pages-deploy-site'
const project = args.project || 'cldflare-maxxing-site'
const domain = args.domain || 'cld-flare-maxxing.abhiigatty.com'
// Always publish to the production branch — the custom domain maps to production,
// not to whatever git branch happens to be checked out. Otherwise a deploy from a
// feature branch silently lands as an unreachable preview.
const branch = args.branch || 'main'
const siteDir = join(DIRS.root, 'site')

if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(project)) {
  log.err('invalid --project; use a lowercase Pages project name')
  process.exit(1)
}
if (!/^[a-z0-9.-]+$/.test(domain) || !domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) {
  log.err('invalid --domain')
  process.exit(1)
}
if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(branch) || branch.includes('..')) {
  log.err('invalid --branch')
  process.exit(1)
}

loadEnv(DIRS.env)
const read = makeClient({ mode: 'read' })
const accountId = await resolveAccountId(read)

// The Pages project list endpoint currently rejects page/per_page query options.
// Do not hide a failed preflight as an empty account: that can make a dry run
// falsely claim an existing project and domain are missing.
const existing = await read.get(`/accounts/${accountId}/pages/projects`)
if (!Array.isArray(existing)) throw new Error('Cloudflare Pages project preflight returned an unexpected response')
const proj = existing.find((p) => p.name === project)
const domainAttached = proj?.domains?.includes(domain)

log.info(`pages-deploy-site — project "${project}" ${proj ? '(exists)' : '(will be created on first deploy)'}, domain "${domain}" ${domainAttached ? '(already attached)' : '(not yet attached)'}`)

if (!commit) {
  console.log('')
  console.log(`  1. pinned wrangler pages deploy site --project-name=${project} --branch=${branch}`)
  if (!domainAttached) console.log(`  2. POST /accounts/${accountId}/pages/projects/${project}/domains  { name: "${domain}" }  (Cloudflare auto-creates the DNS record on the same-account zone)`)
  console.log('')
  log.warn('DRY-RUN — nothing deployed, nothing mutated.')
  log.warn('Re-run with --commit (and break-glass armed) to apply.')
  audit({ action, status: 'DRY_RUN', project, domain, domainAttached })
  return
}

const cf = bootEdit(action, { project, domain })
const wranglerBin = wranglerExecutable()
const mutationEnv = commandEnv({
  CLOUDFLARE_API_TOKEN: cf.token,
  CLOUDFLARE_ACCOUNT_ID: accountId,
})

if (!proj) {
  // The pre-flight list can come back empty when the read token can't see Pages,
  // so "not found" isn't proof the project is missing. Create idempotently:
  // treat an "already exists" response as success and go straight to deploy.
  log.info(`ensuring Pages project "${project}" exists...`)
  const create = spawnSync(process.execPath, [wranglerBin, 'pages', 'project', 'create', project, `--production-branch=${branch}`], {
    encoding: 'utf8',
    env: mutationEnv,
  })
  const out = (create.stdout || '') + (create.stderr || '')
  if (out.trim()) process.stdout.write(out.endsWith('\n') ? out : out + '\n')
  if (/already exists|8000002/i.test(out)) {
    log.info(`project "${project}" already exists — continuing to deploy.`)
  } else if (create.error || create.status !== 0) {
    audit({ action, status: 'FAILED', project, domain, step: 'create project', error: create.error?.message, code: create.status })
    log.err(`project create FAILED — ${create.error?.message ?? `exit code ${create.status}`}`)
    process.exit(create.status ?? 1)
  } else {
    audit({ action, status: 'COMMITTED', project, domain, step: 'create project' })
  }
}

const { payload: versionPayload } = writeVersion()
log.info(`wrote site/version.json — ${versionPayload.shortCommit}`)

log.info(`deploying ${siteDir} → Pages project "${project}"...`)
const deploy = spawnSync(process.execPath, [wranglerBin, 'pages', 'deploy', siteDir, `--project-name=${project}`, `--branch=${branch}`, '--commit-dirty=true'], {
  stdio: 'inherit',
  env: mutationEnv,
})
if (deploy.error) {
  audit({ action, status: 'FAILED', project, domain, step: 'wrangler deploy', error: deploy.error.message })
  log.err(`wrangler deploy failed to launch — ${deploy.error.message}`)
  process.exit(1)
}
if (deploy.status !== 0) {
  audit({ action, status: 'FAILED', project, domain, step: 'wrangler deploy', code: deploy.status, signal: deploy.signal })
  log.err(`wrangler deploy exited with code ${deploy.status}${deploy.signal ? ` (signal ${deploy.signal})` : ''}`)
  process.exit(deploy.status ?? 1)
}
audit({ action, status: 'COMMITTED', project, domain, step: 'wrangler deploy' })
log.ok(`deployed to Pages project "${project}"`)

if (!domainAttached) {
  try {
    await cf.raw('POST', `/accounts/${accountId}/pages/projects/${project}/domains`, { body: { name: domain } })
    audit({ action, status: 'COMMITTED', project, domain, step: 'attach domain' })
    log.ok(`custom domain attached: ${domain} (DNS record auto-created on the same-account zone)`)
  } catch (e) {
    if (/already|exists|duplicate|409/i.test(e.message)) {
      log.ok(`custom domain already attached: ${domain}`)
    } else {
      audit({ action, status: 'FAILED', project, domain, step: 'attach domain', error: e.message })
      log.err(`domain attach FAILED — ${e.message}`)
      throw e
    }
  }
} else {
  log.ok(`custom domain already attached: ${domain}`)
}
log.ok('pages-deploy-site applied. Allow a few minutes for DNS/SSL to propagate.')
}

await main()
