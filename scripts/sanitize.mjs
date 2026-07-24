#!/usr/bin/env node
/**
 * Strip account-specific data so the FRAMEWORK can be shared safely.
 *
 * Keeps: scripts, skills, agents, dashboard, docs, reference, and snapshots/sample.
 * Removes: every real snapshot (all except `sample`, both the local snapshot.json and
 *          the committed snapshot.public.json), everything in reports/, the gitignored
 *          real config files, the alias vault, and resets the snapshot index + dashboard
 *          data back to the sample.
 *
 * Since scripts/lib/idmap.mjs (2026-07-08), real account data was already gitignored —
 * snapshot.json (raw), config/backlog.json, config/token-capabilities.json,
 * config/backlog-curated.json, and secrets/alias-map.json never reach git. This script
 * now matters mainly for the OTHER sharing path: handing over a zip of the whole working
 * directory (docs/SHARING.md), where gitignore doesn't help.
 *
 * Does NOT touch .env / .env.break-glass (already gitignored) — delete those yourself if present.
 *
 * Usage:  npm run sanitize
 */
import { rmSync, readdirSync, existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { DIRS, SNAPSHOT_INDEX, snapshotDir } from './lib/paths.mjs'
import { readJson, writeJson, log } from './lib/util.mjs'

// 1. remove real snapshots (keep `sample`)
let removedSnaps = 0
for (const e of readdirSync(DIRS.snapshots, { withFileTypes: true })) {
  if (e.isDirectory() && e.name !== 'sample') { rmSync(join(DIRS.snapshots, e.name), { recursive: true, force: true }); removedSnaps++ }
}

// 2. reset index to sample
const sample = readJson(join(snapshotDir('sample'), 'snapshot.json'), {})
writeJson(SNAPSHOT_INDEX, {
  latest: 'sample',
  runs: [{ stamp: 'sample', generatedAt: sample.generatedAt || null, counts: sample.counts || {} }],
})

// 3. clear generated reports (regenerated below from sample)
let removedReports = 0
if (existsSync(DIRS.reports)) {
  for (const f of readdirSync(DIRS.reports)) { rmSync(join(DIRS.reports, f), { recursive: true, force: true }); removedReports++ }
}

// 4. remove real (gitignored) config files and the alias vault
let removedConfig = 0
for (const f of ['backlog.json', 'token-capabilities.json', 'backlog-curated.json']) {
  const p = join(DIRS.root, 'config', f)
  if (existsSync(p)) { unlinkSync(p); removedConfig++ }
}
const vaultFile = join(DIRS.root, 'secrets', 'alias-map.json')
if (existsSync(vaultFile)) { unlinkSync(vaultFile); log.warn('removed secrets/alias-map.json — any snapshot.public.json aliases minted before this point are no longer reversible from this copy.') }

log.info(`removed ${removedSnaps} real snapshot(s), ${removedReports} report file(s), ${removedConfig} config file(s)`)

// 5. regenerate sample artifacts so the repo stays in a working, shareable state
for (const s of ['report.mjs', 'betas.mjs', 'build-dashboard-data.mjs', 'build-actions.mjs']) {
  execFileSync(process.execPath, [join(DIRS.scripts, s)], { stdio: 'inherit' })
}

log.ok('sanitized — only sample data remains. Safe to share the framework.')
log.warn('Reminder: if .env or .env.break-glass exist locally, they are gitignored but still on disk — delete them before sharing the working directory (this also drops CF_ALIAS_SALT).')
