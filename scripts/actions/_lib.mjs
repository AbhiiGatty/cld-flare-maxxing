// Shared bootstrap for guarded (mutating) actions.
// Every action: loads .env + .env.break-glass, enforces break-glass, defaults to
// DRY-RUN (prints intended change) and only mutates when --commit is passed.
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { DIRS } from '../lib/paths.mjs'
import { loadEnv, log } from '../lib/util.mjs'
import { makeClient } from '../lib/cf.mjs'
import { assertBreakGlass, breakGlassBanner, audit } from '../lib/guard.mjs'
import { loadVault, resolveAlias } from '../lib/idmap.mjs'

export function parseArgs(argv) {
  const args = {}
  const pos = []
  for (const a of argv) {
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=')
      args[k] = v === undefined ? true : v
    } else pos.push(a)
  }
  return { args, pos, commit: args.commit === true || args.commit === 'true' }
}

/** Arm the edit client. Throws (via guard) unless break-glass is set. */
export function bootEdit(action, details = {}) {
  loadEnv(join(DIRS.root, '.env'))
  loadEnv(join(DIRS.root, '.env.break-glass'))
  assertBreakGlass(action, details)
  breakGlassBanner(action)
  return makeClient({ mode: 'edit' })
}

export function bootRead() {
  loadEnv(join(DIRS.root, '.env'))
  return makeClient({ mode: 'read' })
}

/** Environment for dependency, build, and mutation subprocesses. It deliberately
 * omits CF_EDIT_TOKEN, CF_ALLOW_DESTRUCTIVE, NODE_OPTIONS, and unrelated secrets. */
export function commandEnv(extra = {}) {
  const allowed = [
    'PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT',
    'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA',
    'LANG', 'LC_ALL', 'TERM', 'NO_COLOR', 'CI',
    'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY',
    'http_proxy', 'https_proxy', 'no_proxy',
  ]
  const env = {}
  for (const name of allowed) if (process.env[name] != null) env[name] = process.env[name]
  return { ...env, ...extra }
}

export function npmExecutable() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm'
}

export function wranglerExecutable(root = DIRS.root) {
  const executable = join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
  if (!existsSync(executable)) {
    throw new Error(`Pinned Wrangler is missing at ${executable}. Run the locked dependency install first.`)
  }
  return executable
}

/** Resolve a zone id from an id, a name, or an alias (zone_xxxx / zone-xxxx.example.com
 *  from a committed snapshot.public.json — resolved back to the real id/name via the
 *  local vault first, see scripts/lib/idmap.mjs / scripts/resolve.mjs). */
export async function resolveZone(cf, zoneRef) {
  if (!zoneRef) throw new Error('missing --zone=<id|name|alias>')
  zoneRef = resolveAlias(zoneRef, loadVault())
  if (/^[0-9a-f]{32}$/i.test(zoneRef)) return zoneRef
  const zones = await cf.getAll('/zones', { query: { name: zoneRef, per_page: 5 } })
  if (!zones.length) throw new Error(`zone not found: ${zoneRef}`)
  return zones[0].id
}

export { log, audit }
