// Canonical paths + snapshot bookkeeping (no symlinks — Windows friendly).
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import { readJson, writeJson } from './util.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const ROOT = resolve(__dirname, '..', '..')

export const DIRS = {
  root: ROOT,
  scripts: join(ROOT, 'scripts'),
  snapshots: join(ROOT, 'snapshots'),
  reports: join(ROOT, 'reports'),
  reference: join(ROOT, 'reference'),
  dashboardData: join(ROOT, 'dashboard', 'public', 'data'),
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
