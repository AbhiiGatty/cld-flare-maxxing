import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import test from 'node:test'
import { commandEnv } from '../scripts/actions/_lib.mjs'

const actionsDir = new URL('../scripts/actions/', import.meta.url)

test('subprocess environment excludes break-glass and Node injection variables', () => {
  const previous = {
    CF_EDIT_TOKEN: process.env.CF_EDIT_TOKEN,
    CF_ALLOW_DESTRUCTIVE: process.env.CF_ALLOW_DESTRUCTIVE,
    NODE_OPTIONS: process.env.NODE_OPTIONS,
  }
  process.env.CF_EDIT_TOKEN = 'edit-token-that-must-not-leak'
  process.env.CF_ALLOW_DESTRUCTIVE = 'YES_I_AM_SURE'
  process.env.NODE_OPTIONS = '--require=untrusted-module'

  try {
    const env = commandEnv({ CLOUDFLARE_API_TOKEN: 'scoped-child-token' })
    assert.equal(env.CF_EDIT_TOKEN, undefined)
    assert.equal(env.CF_ALLOW_DESTRUCTIVE, undefined)
    assert.equal(env.NODE_OPTIONS, undefined)
    assert.equal(env.CLOUDFLARE_API_TOKEN, 'scoped-child-token')
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
})

test('action subprocesses do not use a shell or inherit the full environment', async () => {
  const files = (await readdir(actionsDir)).filter((file) => file.endsWith('.mjs'))
  const sources = await Promise.all(files.map(async (file) => ({
    file,
    source: await readFile(new URL(file, actionsDir), 'utf8'),
  })))

  for (const { file, source } of sources) {
    assert.doesNotMatch(source, /\bshell\s*:/, `${file} enables a shell`)
    assert.doesNotMatch(source, /\.\.\.process\.env/, `${file} inherits the full parent environment`)
    assert.doesNotMatch(source, /spawnSync\(\s*['"]npx['"]/, `${file} invokes unpinned npx`)
  }
})

test('dry runs finish before loading the edit token', async () => {
  for (const file of [
    'dns-delete-record.mjs',
    'pages-git-auto-deploy-toggle.mjs',
    'pages-deploy-site.mjs',
    'pages-preview-toggle.mjs',
    'purge-cache.mjs',
  ]) {
    const source = await readFile(new URL(file, actionsDir), 'utf8')
    const dryRun = source.indexOf('if (!commit)')
    const editBoot = source.indexOf('const cf = bootEdit')
    assert.ok(dryRun >= 0, `${file} has no dry-run branch`)
    assert.ok(editBoot > dryRun, `${file} loads the edit token before its dry run exits`)
  }
})

test('Pages deployment preflight fails closed and does not paginate the project list', async () => {
  const source = await readFile(new URL('pages-deploy-site.mjs', actionsDir), 'utf8')

  assert.match(source, /await read\.get\(`\/accounts\/\$\{accountId\}\/pages\/projects`\)/)
  assert.doesNotMatch(source, /getAll\(`\/accounts\/\$\{accountId\}\/pages\/projects`/)
  assert.doesNotMatch(source, /\.catch\(\(\) => \[\]\)/)
  assert.doesNotMatch(source, /process\.exit\(0\)/)
})

test('Social Desk install and build steps finish before loading the edit token', async () => {
  const deploy = await readFile(new URL('social-desk-deploy.mjs', actionsDir), 'utf8')
  const secrets = await readFile(new URL('social-desk-meta-secrets.mjs', actionsDir), 'utf8')

  assert.ok(deploy.indexOf("run('install locked Social Desk dependencies'") < deploy.indexOf('const cf = bootEdit'))
  assert.ok(deploy.indexOf("run('build Social Desk assets'") < deploy.indexOf('const cf = bootEdit'))
  assert.ok(secrets.indexOf("spawnSync(npmExecutable()") < secrets.indexOf('const cf = bootEdit'))
})

test('public action source contains no operator email addresses', async () => {
  const provision = await readFile(new URL('social-desk-provision.mjs', actionsDir), 'utf8')
  assert.doesNotMatch(provision, /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)
})

test('Social Desk actions require resource names instead of publishing account defaults', async () => {
  const provision = await readFile(new URL('social-desk-provision.mjs', actionsDir), 'utf8')
  const deploy = await readFile(new URL('social-desk-deploy.mjs', actionsDir), 'utf8')
  const secrets = await readFile(new URL('social-desk-meta-secrets.mjs', actionsDir), 'utf8')

  assert.match(provision, /String\(args\.database \|\| ''\)/)
  assert.match(provision, /String\(args\.domain \|\| ''\)/)
  assert.match(deploy, /String\(args\.worker \|\| ''\)/)
  assert.match(deploy, /String\(args\.database \|\| ''\)/)
  assert.match(deploy, /String\(args\.domain \|\| ''\)/)
  assert.match(secrets, /String\(args\.worker \|\| ''\)/)
})
