import assert from 'node:assert/strict'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const pluginRoot = join(root, 'plugins', 'cld-flare-maxxing')
const skillRoot = join(pluginRoot, 'skills', 'cloudflare-maxxing')
const runner = join(skillRoot, 'scripts', 'cf-maxxing.mjs')
const hook = join(pluginRoot, 'hooks', 'guard.mjs')

function json(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function runNode(script, args, options = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: options.cwd || root,
    env: options.env || process.env,
    input: options.input,
    encoding: 'utf8',
    shell: false,
  })
}

function filesUnder(directory, skip = () => false) {
  const files = []
  function visit(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      const child = relative(directory, path).replaceAll('\\', '/')
      if (skip(child)) continue
      if (entry.isDirectory()) visit(path)
      else files.push(child)
    }
  }
  visit(directory)
  return files.sort()
}

test('plugin manifests and marketplaces agree on identity and version', () => {
  const pkg = json(join(root, 'package.json'))
  const codexPlugin = json(join(pluginRoot, '.codex-plugin', 'plugin.json'))
  const claudePlugin = json(join(pluginRoot, '.claude-plugin', 'plugin.json'))
  const codexMarketplace = json(join(root, '.agents', 'plugins', 'marketplace.json'))
  const claudeMarketplace = json(join(root, '.claude-plugin', 'marketplace.json'))

  assert.equal(codexPlugin.name, 'cld-flare-maxxing')
  assert.equal(claudePlugin.name, codexPlugin.name)
  assert.equal(codexPlugin.version, pkg.version)
  assert.equal(claudePlugin.version, pkg.version)
  assert.equal(claudeMarketplace.plugins[0].version, pkg.version)
  assert.equal(codexMarketplace.plugins[0].source.path, './plugins/cld-flare-maxxing')
  assert.equal(claudeMarketplace.plugins[0].source, './plugins/cld-flare-maxxing')
  assert.equal(codexPlugin.skills, './skills/')
  assert.ok(existsSync(join(skillRoot, 'SKILL.md')))

  for (const template of ['.env.cloudflare.example', '.env.cloudflare.break-glass.example']) {
    const path = relative(root, join(
      skillRoot,
      'scripts',
      'runtime',
      'templates',
      template,
    )).replaceAll('\\', '/')
    const tracked = spawnSync('git', ['ls-files', '--error-unmatch', path], {
      cwd: root,
      encoding: 'utf8',
    })
    assert.equal(tracked.status, 0, `${template} is missing from the Git package`)
  }
})

test('a copied skill initializes without touching host env or dependencies', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'cf-maxxing-portable-'))
  const copiedSkill = join(scratch, 'installed-skill')
  const host = join(scratch, 'host-project')
  try {
    cpSync(skillRoot, copiedSkill, { recursive: true })
    mkdirSync(host)
  } catch {
    rmSync(scratch, { recursive: true, force: true })
    throw new Error('temporary portable test setup failed')
  }

  try {
    writeFileSync(join(host, '.env'), 'HOST_SECRET=untouched\n')
    writeFileSync(join(host, 'package.json'), '{"private":true}\n')

    const copiedRunner = join(copiedSkill, 'scripts', 'cf-maxxing.mjs')
    const result = runNode(copiedRunner, ['init'], { cwd: host })
    assert.equal(result.status, 0, result.stderr)

    const state = join(host, '.cloudflare-maxxing')
    assert.ok(existsSync(join(state, '.env.cloudflare')))
    const stateIgnore = readFileSync(join(state, '.gitignore'), 'utf8')
    assert.match(stateIgnore, /^\*/m)
    assert.doesNotMatch(stateIgnore, /^!\.gitignore$/m)
    assert.equal(readFileSync(join(host, '.env'), 'utf8'), 'HOST_SECRET=untouched\n')
    assert.equal(readFileSync(join(host, 'package.json'), 'utf8'), '{"private":true}\n')
    assert.equal(readdirSync(host).sort().join(','), '.cloudflare-maxxing,.env,package.json')

    const initGit = spawnSync('git', ['init', '--quiet'], { cwd: host, encoding: 'utf8' })
    assert.equal(initGit.status, 0, initGit.stderr)
    const stateStatus = spawnSync('git', ['status', '--short', '--', '.cloudflare-maxxing'], {
      cwd: host,
      encoding: 'utf8',
    })
    assert.equal(stateStatus.status, 0, stateStatus.stderr)
    assert.equal(stateStatus.stdout, '', 'portable state appears as host-project Git noise')

    const where = runNode(copiedRunner, ['where'], { cwd: host })
    assert.equal(where.status, 0, where.stderr)
    const paths = JSON.parse(where.stdout)
    assert.equal(paths.projectRoot, host)
    assert.equal(paths.stateRoot, state)
    assert.match(paths.runtimeRoot, /installed-skill[\\/]scripts[\\/]runtime$/)
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
})

test('portable runtime copies stay in sync with repository sources', () => {
  const runtime = join(skillRoot, 'scripts', 'runtime')
  const sourceScripts = join(root, 'scripts')
  const copiedScripts = join(runtime, 'scripts')
  const topLevel = [
    'alias-existing.mjs',
    'betas.mjs',
    'build-actions.mjs',
    'build-dashboard-data.mjs',
    'capabilities.mjs',
    'diff.mjs',
    'report.mjs',
    'resolve.mjs',
    'setup.mjs',
    'snapshot.mjs',
  ]
  const library = filesUnder(join(sourceScripts, 'lib')).filter((file) => file.endsWith('.mjs'))
  const actions = [
    '_lib.mjs',
    'dns-create-record.mjs',
    'dns-delete-record.mjs',
    'pages-preview-toggle.mjs',
    'purge-cache.mjs',
    'security-baseline.mjs',
    'waf-managed-deploy.mjs',
  ]

  for (const file of topLevel) {
    assert.equal(
      readFileSync(join(copiedScripts, file), 'utf8'),
      readFileSync(join(sourceScripts, file), 'utf8'),
      `portable script drift: ${file}`,
    )
  }
  for (const file of library) {
    assert.equal(
      readFileSync(join(copiedScripts, 'lib', file), 'utf8'),
      readFileSync(join(sourceScripts, 'lib', file), 'utf8'),
      `portable library drift: ${file}`,
    )
  }
  for (const file of actions) {
    assert.equal(
      readFileSync(join(copiedScripts, 'actions', file), 'utf8'),
      readFileSync(join(sourceScripts, 'actions', file), 'utf8'),
      `portable action drift: ${file}`,
    )
  }

  for (const file of filesUnder(join(root, 'reference')).filter((file) => file.endsWith('.json'))) {
    assert.equal(
      readFileSync(join(runtime, 'reference', file), 'utf8'),
      readFileSync(join(root, 'reference', file), 'utf8'),
      `portable reference drift: ${file}`,
    )
  }

  const dashboardSkip = (file) =>
    file.startsWith('node_modules/')
    || file.startsWith('dist/')
    || (file.startsWith('public/data/') && file !== 'public/data/README.md')
  for (const file of filesUnder(join(root, 'dashboard'), dashboardSkip)) {
    assert.equal(
      readFileSync(join(runtime, 'dashboard', file), 'utf8'),
      readFileSync(join(root, 'dashboard', file), 'utf8'),
      `portable dashboard drift: ${file}`,
    )
  }
})

test('portable runner rejects unbundled actions', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'cf-maxxing-action-'))
  try {
    const result = runNode(runner, ['action', 'pages-deploy-site'], { cwd: scratch })
    assert.equal(result.status, 2)
    assert.match(result.stderr, /Unknown or unbundled action/)
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
})

test('Claude hook blocks Cloudflare bypasses without policing host cleanup', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'cf-maxxing-hook-'))
  const env = { ...process.env, CLAUDE_PROJECT_DIR: scratch }
  const invoke = (tool_name, command) => runNode(hook, [], {
    cwd: scratch,
    env,
    input: JSON.stringify({ tool_name, tool_input: { command } }),
  })

  try {
    assert.equal(invoke('Bash', 'Remove-Item config -Recurse').status, 0)
    assert.equal(invoke('Bash', 'curl https://api.cloudflare.com/client/v4/zones').status, 0)
    assert.equal(invoke('Bash', 'node cf-maxxing.mjs action dns-create-record --zone=example.com').status, 0)

    assert.equal(invoke('Bash', 'Remove-Item .cloudflare-maxxing -Recurse').status, 2)
    assert.equal(invoke('Bash', 'curl -X DELETE https://api.cloudflare.com/client/v4/zones/1').status, 2)
    assert.equal(invoke('Bash', 'wrangler pages project delete example').status, 2)
    assert.equal(invoke('mcp__cloudflare__execute', 'POST /zones/1/purge_cache').status, 2)
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
})
