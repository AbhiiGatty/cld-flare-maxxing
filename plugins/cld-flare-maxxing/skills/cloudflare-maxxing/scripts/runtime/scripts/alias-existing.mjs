#!/usr/bin/env node
/**
 * Backfill: pseudonymize every existing local snapshot into its committed
 * sibling. For each snapshots/<stamp>/snapshot.json (raw, real data), writes
 * snapshots/<stamp>/snapshot.public.json (aliased — real ids/domains/names/
 * emails/IPs replaced with deterministic aliases via scripts/lib/idmap.mjs).
 *
 * Dry-run by default: reports what would be minted/written, writes nothing.
 * --commit actually writes the public siblings and saves the vault
 * (secrets/alias-map.json).
 *
 * Usage:  node scripts/alias-existing.mjs             (dry-run)
 *         node scripts/alias-existing.mjs --commit
 */
import { join } from 'node:path'
import { readdirSync, existsSync } from 'node:fs'
import { DIRS, snapshotDir } from './lib/paths.mjs'
import { loadEnv, readJson, writeJson, log } from './lib/util.mjs'
import { aliasSnapshot, loadVault, saveVault } from './lib/idmap.mjs'

loadEnv(DIRS.env)
const commit = process.argv.includes('--commit')

const stamps = readdirSync(DIRS.snapshots, { withFileTypes: true })
  .filter((e) => e.isDirectory() && e.name !== 'sample')
  .map((e) => e.name)
  .sort()

if (!stamps.length) { log.err('No snapshots found under snapshots/.'); process.exit(1) }

log.step(`${commit ? 'COMMIT' : 'DRY-RUN'} — aliasing ${stamps.length} snapshot(s)`)
const vault = loadVault()
const before = Object.keys(vault.entries).length

let written = 0, skippedNoRaw = 0
let last = null
const perStamp = []
for (const s of stamps) {
  const dir = snapshotDir(s)
  const rawFile = join(dir, 'snapshot.json')
  if (!existsSync(rawFile)) { skippedNoRaw++; continue }
  const raw = readJson(rawFile, null)
  if (!raw) { skippedNoRaw++; continue }

  const before1 = Object.keys(vault.entries).length
  const { aliased, dirty } = aliasSnapshot(raw, vault)
  const minted = Object.keys(vault.entries).length - before1
  perStamp.push({ stamp: s, minted })
  last = { stamp: s, raw, aliased }

  if (commit) {
    writeJson(join(dir, 'snapshot.public.json'), aliased)
    written++
  }
}

const totalMinted = Object.keys(vault.entries).length - before
log.info(`vault entries: ${before} → ${before + totalMinted} (+${totalMinted})`)
for (const p of perStamp.slice(0, 5)) log.dim(`   ${p.stamp}: +${p.minted} new`)
if (perStamp.length > 5) log.dim(`   ... and ${perStamp.length - 5} more`)
if (skippedNoRaw) log.warn(`${skippedNoRaw} snapshot dir(s) had no readable snapshot.json — skipped`)

if (commit) {
  saveVault(vault)
  log.ok(`wrote ${written} snapshot.public.json file(s), vault saved → secrets/alias-map.json`)
  log.dim('next: git status  (only *.public.json should show as new/changed under snapshots/)')
} else {
  log.warn('DRY RUN — nothing written. Re-run with --commit to write snapshot.public.json + save the vault.')
  if (last) {
    log.info(`sample (${last.stamp}): account.id aliased=${last.raw.account?.id !== last.aliased.account?.id}`)
    log.info(`sample (${last.stamp}): zone[0].name aliased=${last.raw.zones?.[0]?.name !== last.aliased.zones?.[0]?.name}`)
  }
}
