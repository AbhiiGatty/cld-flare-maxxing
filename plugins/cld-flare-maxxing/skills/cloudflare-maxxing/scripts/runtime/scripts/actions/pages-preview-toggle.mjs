#!/usr/bin/env node
/**
 * Guarded action: toggle preview deployments on a Cloudflare Pages project
 * (source.config.preview_deployment_setting — "all" | "none" | "custom").
 *
 * DRY-RUN by default. --commit to apply. Requires break-glass.
 *
 * Examples:
 *   ... pages-preview-toggle.mjs --project=my-pages-project --setting=none --commit
 *   ... pages-preview-toggle.mjs --project=my-pages-project --setting=all --commit
 */
import { bootEdit, bootRead, parseArgs, log, audit } from './_lib.mjs'
import { resolveAccountId } from '../lib/cf.mjs'

const { args, commit } = parseArgs(process.argv.slice(2))
const action = 'pages-preview-toggle'
const VALID = new Set(['all', 'none', 'custom'])

if (!args.project) { log.err('missing --project=<pages-project-name>'); process.exit(1) }
if (!VALID.has(args.setting)) { log.err('missing/invalid --setting=all|none|custom'); process.exit(1) }

const read = bootRead()
const accountId = await resolveAccountId(read)

const before = await read.get(`/accounts/${accountId}/pages/projects/${args.project}`)
const current = before.source?.config?.preview_deployment_setting ?? 'unknown'
log.info(`project: ${args.project}`)
log.info(`preview_deployment_setting: ${current} -> ${args.setting}`)

if (!commit) {
  log.warn('DRY-RUN — nothing changed. Re-run with --commit to apply.')
  audit({ action, status: 'DRY_RUN', project: args.project, from: current, to: args.setting })
  process.exit(0)
}

const cf = bootEdit(action, { project: args.project, setting: args.setting })
await cf.raw('PATCH', `/accounts/${accountId}/pages/projects/${args.project}`, {
  body: { source: { config: { preview_deployment_setting: args.setting } } },
})
audit({ action, status: 'COMMITTED', project: args.project, from: current, to: args.setting })
log.ok(`preview_deployment_setting set to "${args.setting}" on ${args.project}`)
