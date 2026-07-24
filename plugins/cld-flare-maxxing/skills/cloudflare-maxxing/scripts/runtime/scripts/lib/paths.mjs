// Canonical paths + snapshot bookkeeping (no symlinks — Windows friendly).
// CF_MAXXING_HOME keeps portable plugin state inside the host project while
// CF_MAXXING_BUNDLE_ROOT points at the plugin's read-only scripts/references.
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import { readJson, writeJson } from './util.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const CODE_ROOT = resolve(__dirname, '..', '..')
export const BUNDLE_ROOT = resolve(process.env.CF_MAXXING_BUNDLE_ROOT || CODE_ROOT)
export const ROOT = resolve(process.env.CF_MAXXING_HOME || CODE_ROOT)
export const PORTABLE = ROOT !== CODE_ROOT

export const DIRS = {
  root: ROOT,
  bundle: BUNDLE_ROOT,
  scripts: join(BUNDLE_ROOT, 'scripts'),
  snapshots: join(ROOT, 'snapshots'),
  reports: join(ROOT, 'reports'),
  reference: join(BUNDLE_ROOT, 'reference'),
  dashboardData: join(ROOT, 'dashboard', 'public', 'data'),
  dashboardTemplate: join(BUNDLE_ROOT, 'dashboard'),
  env: join(ROOT, PORTABLE ? '.env.cloudflare' : '.env'),
  envExample: PORTABLE
    ? join(BUNDLE_ROOT, 'templates', '.env.cloudflare.example')
    : join(ROOT, '.env.example'),
  breakGlassEnv: join(ROOT, PORTABLE ? '.env.cloudflare.break-glass' : '.env.break-glass'),
  breakGlassEnvExample: PORTABLE
    ? join(BUNDLE_ROOT, 'templates', '.env.cloudflare.break-glass.example')
    : join(ROOT, '.env.break-glass.example'),
}

export const SNAPSHOT_INDEX = join(DIRS.snapshots, 'index.json')

export function snapshotDir(stamp) {
  return join(DIRS.snapshots, stamp)
}

/** Record a completed snapshot and mark it as latest. */
export function recordSnapshot(stamp, meta = {}) {
  const idx = readJson(SNAPSHOT_INDEX, { latest: null, runs: [] }) || { latest: null, runs: [] }
  idx.latest = stamp
  idx.runs = (idx.runs || []).filter((r) => r.stamp !== stamp)
  idx.runs.unshift({ stamp, ...meta })
  idx.runs = idx.runs.slice(0, 200)
  writeJson(SNAPSHOT_INDEX, idx)
  return idx
}

/** Resolve the directory of the most recent snapshot (or a named one). */
export function latestSnapshotStamp() {
  const idx = readJson(SNAPSHOT_INDEX, null)
  return idx?.latest || null
}
