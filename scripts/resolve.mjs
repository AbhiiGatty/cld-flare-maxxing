#!/usr/bin/env node
/**
 * Look up an alias from a committed snapshot.public.json (or config, or the
 * dashboard) against the local vault, or the reverse. Read-only, local-only —
 * makes no network calls.
 *
 * Usage:  node scripts/resolve.mjs zone_46147b4b        (alias -> real value)
 *         node scripts/resolve.mjs --real example.com (real value -> alias)
 */
import { join } from 'node:path'
import { DIRS } from './lib/paths.mjs'
import { loadEnv, log } from './lib/util.mjs'
import { loadVault, realFor, aliasFor } from './lib/idmap.mjs'

loadEnv(join(DIRS.root, '.env'))
const [flag, arg] = process.argv.slice(2)
const vault = loadVault()

if (flag === '--real') {
  if (!arg) { log.err('usage: node scripts/resolve.mjs --real <realValue>'); process.exit(1) }
  const alias = aliasFor(arg, vault)
  if (!alias) { log.err(`no alias found for ${arg} — it may not have appeared in any aliased snapshot yet`); process.exit(1) }
  console.log(alias)
} else {
  const alias = flag
  if (!alias) { log.err('usage: node scripts/resolve.mjs <alias>   |   node scripts/resolve.mjs --real <realValue>'); process.exit(1) }
  const real = realFor(alias, vault)
  if (real === null) { log.err(`unknown alias: ${alias} (not in secrets/alias-map.json)`); process.exit(1) }
  console.log(real)
}
