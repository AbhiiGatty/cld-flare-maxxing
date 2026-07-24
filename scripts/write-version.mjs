#!/usr/bin/env node
/**
 * Write site/version.json with the commit currently being deployed.
 *
 * site/ is the deploy root passed straight to `wrangler pages deploy site/`
 * (no build step, no build-output dir), so this writes into site/ directly.
 *
 * Called from scripts/actions/pages-deploy-site.mjs right before the
 * `wrangler pages deploy` spawnSync call, so version.json only gets
 * (re)written at the moment of an actual --commit deploy.
 */
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { DIRS } from './lib/paths.mjs'
import { writeJson } from './lib/util.mjs'

export function writeVersion() {
  let commit = 'unknown'
  try {
    commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: DIRS.root, encoding: 'utf8' }).trim() || 'unknown'
  } catch {
    commit = 'unknown'
  }

  const payload = {
    commit,
    shortCommit: commit === 'unknown' ? 'unknown' : commit.slice(0, 7),
    builtAt: new Date().toISOString(),
  }

  const file = join(DIRS.root, 'site', 'version.json')
  writeJson(file, payload)
  return { file, payload }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  const { file, payload } = writeVersion()
  console.log(`wrote ${file} — ${payload.shortCommit}`)
}
