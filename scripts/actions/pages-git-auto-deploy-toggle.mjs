#!/usr/bin/env node
/**
 * Guarded action: configure automatic Git-triggered deployments on an existing
 * Cloudflare Pages project.
 *
 * DRY-RUN by default. --commit to apply. Requires break-glass.
 *
 * Flags:
 *   --project=<name>
 *   [--production=on|off]
 *   [--previews=all|none|custom]
 *   [--commit]
 *
 * Example:
 *   node scripts/actions/pages-git-auto-deploy-toggle.mjs \
 *     --project=my-pages-project --production=off --previews=none
 */
import { bootEdit, bootRead, parseArgs, log, audit } from './_lib.mjs'
import { resolveAccountId } from '../lib/cf.mjs'

async function main() {
  const { args, commit } = parseArgs(process.argv.slice(2))
  const action = 'pages-git-auto-deploy-toggle'
  const project = args.project
  const productionValues = new Set(['on', 'off'])
  const previewValues = new Set(['all', 'none', 'custom'])

  if (!project) {
    log.err('missing --project=<pages-project-name>')
    process.exitCode = 1
    return
  }
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(project)) {
    log.err('invalid --project; use a lowercase Pages project name')
    process.exitCode = 1
    return
  }
  if (args.production == null && args.previews == null) {
    log.err('set --production=on|off, --previews=all|none|custom, or both')
    process.exitCode = 1
    return
  }
  if (args.production != null && !productionValues.has(args.production)) {
    log.err('invalid --production; use on or off')
    process.exitCode = 1
    return
  }
  if (args.previews != null && !previewValues.has(args.previews)) {
    log.err('invalid --previews; use all, none, or custom')
    process.exitCode = 1
    return
  }

  const read = bootRead()
  const accountId = await resolveAccountId(read)
  const before = await read.get(`/accounts/${accountId}/pages/projects/${project}`)
  if (!before?.source?.config) {
    throw new Error(`Pages project "${project}" is not Git-integrated`)
  }

  const currentProduction = before.source.config.production_deployments_enabled
  const currentPreviews = before.source.config.preview_deployment_setting
  const targetProduction = args.production == null ? currentProduction : args.production === 'on'
  const targetPreviews = args.previews ?? currentPreviews
  const changed = currentProduction !== targetProduction || currentPreviews !== targetPreviews

  log.info(`project: ${project}`)
  log.info(`automatic production deployments: ${currentProduction ? 'on' : 'off'} -> ${targetProduction ? 'on' : 'off'}`)
  log.info(`automatic preview deployments: ${currentPreviews} -> ${targetPreviews}`)

  const details = {
    project,
    productionFrom: currentProduction,
    productionTo: targetProduction,
    previewsFrom: currentPreviews,
    previewsTo: targetPreviews,
  }

  if (!changed) {
    audit({ action, status: 'SKIPPED', ...details })
    log.ok('Pages Git deployment settings already match the requested state.')
    return
  }

  if (!commit) {
    audit({ action, status: 'DRY_RUN', ...details })
    log.warn('DRY-RUN: nothing changed. Re-run with --commit and break-glass armed to apply.')
    return
  }

  const cf = bootEdit(action, details)
  const config = {}
  if (args.production != null) config.production_deployments_enabled = targetProduction
  if (args.previews != null) config.preview_deployment_setting = targetPreviews

  await cf.raw('PATCH', `/accounts/${accountId}/pages/projects/${project}`, {
    body: { source: { config } },
  })
  audit({ action, status: 'COMMITTED', ...details })
  log.ok('Pages automatic Git deployments updated.')
}

await main()
