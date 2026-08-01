#!/usr/bin/env node
/**
 * Guarded action: delete a Pages project's preview-environment deployments,
 * killing their permanent <hash>.<project>.pages.dev URLs. Production
 * deployments are never touched.
 *
 * Cloudflare refuses to delete the latest deployment of any branch, so the
 * newest preview per branch may survive with a FAILED audit line - expected,
 * documented platform behavior (see the 2026-07-10 experiences entry).
 * force=true is passed so aliased previews delete too.
 *
 * DRY-RUN by default. --commit to apply. Requires break-glass.
 *
 * Flags: --project=<name> | --all-projects  [--commit]
 *
 *   node scripts/actions/pages-delete-preview-deployments.mjs --all-projects   # dry-run
 *   CF_ALLOW_DESTRUCTIVE=YES_I_AM_SURE node scripts/actions/pages-delete-preview-deployments.mjs --all-projects --commit
 */
import { bootEdit, bootRead, parseArgs, log, audit } from './_lib.mjs'
import { resolveAccountId } from '../lib/cf.mjs'

const { args, commit } = parseArgs(process.argv.slice(2))
const action = 'pages-delete-preview-deployments'
if (!args.project && !args['all-projects']) { log.err('missing --project=<name> or --all-projects'); process.exit(1) }

const read = bootRead()
const accountId = await resolveAccountId(read)

let projectNames = []
if (args['all-projects']) {
  projectNames = (await read.get(`/accounts/${accountId}/pages/projects`)).map((p) => p.name)
} else {
  projectNames = [args.project]
}

// Paginate the deployments list per project (25/page default).
async function allDeployments(name) {
  const out = []
  for (let page = 1; page <= 40; page++) {
    const batch = await read.get(`/accounts/${accountId}/pages/projects/${name}/deployments`, { query: { page, per_page: 25 } })
    if (!batch?.length) break
    out.push(...batch)
    if (batch.length < 25) break
  }
  return out
}

const plan = []
for (const name of projectNames) {
  const deps = await allDeployments(name)
  const previews = deps.filter((d) => d.environment === 'preview')
  if (previews.length) plan.push({ name, previews })
  log.info(`${name}: ${deps.length} deployments, ${previews.length} preview(s) to delete`)
}

const total = plan.reduce((n, p) => n + p.previews.length, 0)
if (!total) { log.ok('no preview deployments anywhere — nothing to change.'); process.exit(0) }

if (!commit) {
  console.log('')
  log.warn(`DRY-RUN — would delete ${total} preview deployment(s) (their .pages.dev URLs stop resolving). Production untouched. Nothing mutated.`)
  log.warn('The newest preview per branch may refuse deletion (platform rule) — expected.')
  audit({ action, status: 'DRY_RUN', total, projects: plan.map((p) => `${p.name}:${p.previews.length}`) })
  process.exit(0)
}

const cf = bootEdit(action, { total, projects: plan.map((p) => `${p.name}:${p.previews.length}`) })
let deleted = 0, refused = 0
for (const p of plan) {
  for (const d of p.previews) {
    try {
      await cf.raw('DELETE', `/accounts/${accountId}/pages/projects/${p.name}/deployments/${d.id}`, { query: { force: 'true' } })
      deleted++
    } catch (e) {
      refused++
      audit({ action, status: 'FAILED', project: p.name, deployment: d.id, error: e.message })
    }
  }
  log.ok(`${p.name}: done`)
}
audit({ action, status: 'COMMITTED', deleted, refused })
log.ok(`deleted ${deleted} preview deployment(s); ${refused} refused by the platform (latest-per-branch rule).`)
