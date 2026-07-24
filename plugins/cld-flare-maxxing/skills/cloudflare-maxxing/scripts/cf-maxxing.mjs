#!/usr/bin/env node
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const runtimeRoot = join(scriptDir, 'runtime')
const runtimeScripts = join(runtimeRoot, 'scripts')
const rawArgs = process.argv.slice(2)
const projectArgIndex = rawArgs.findIndex((arg) => arg.startsWith('--project='))
const projectArg = projectArgIndex >= 0 ? rawArgs.splice(projectArgIndex, 1)[0].slice('--project='.length) : null
const projectRoot = resolve(projectArg || process.cwd())
const stateRoot = join(projectRoot, '.cloudflare-maxxing')

const command = rawArgs.shift() || 'help'
const allowedActions = new Set([
  'dns-create-record',
  'dns-delete-record',
  'pages-preview-toggle',
  'purge-cache',
  'security-baseline',
  'waf-managed-deploy',
])

function ensureState() {
  mkdirSync(stateRoot, { recursive: true })
  const ignoreFile = join(stateRoot, '.gitignore')
  if (!existsSync(ignoreFile)) {
    copyFileSync(join(runtimeRoot, 'templates', 'state.gitignore'), ignoreFile)
  }
}

function commandEnv({ allowBreakGlass = false } = {}) {
  const allowed = [
    'PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT',
    'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA',
    'LANG', 'LC_ALL', 'TERM', 'NO_COLOR', 'CI',
    'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY',
    'http_proxy', 'https_proxy', 'no_proxy',
  ]
  const env = {}
  for (const name of allowed) if (process.env[name] != null) env[name] = process.env[name]
  if (allowBreakGlass && process.env.CF_ALLOW_DESTRUCTIVE != null) {
    env.CF_ALLOW_DESTRUCTIVE = process.env.CF_ALLOW_DESTRUCTIVE
  }
  if (allowBreakGlass && process.env.CF_EDIT_TOKEN != null) {
    env.CF_EDIT_TOKEN = process.env.CF_EDIT_TOKEN
  }
  env.CF_MAXXING_HOME = stateRoot
  env.CF_MAXXING_BUNDLE_ROOT = runtimeRoot
  return env
}

function runNode(relativeFile, args = [], options = {}) {
  const result = spawnSync(
    process.execPath,
    [join(runtimeScripts, relativeFile), ...args],
    {
      cwd: projectRoot,
      env: commandEnv(options),
      stdio: 'inherit',
      shell: false,
    },
  )
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function runNpm(args, cwd) {
  const windows = process.platform === 'win32'
  const executable = windows
    ? (process.env.ComSpec || process.env.COMSPEC || 'cmd.exe')
    : 'npm'
  const executableArgs = windows
    ? ['/d', '/s', '/c', 'npm.cmd', ...args]
    : args
  const result = spawnSync(executable, executableArgs, {
    cwd,
    env: commandEnv(),
    stdio: 'inherit',
    shell: false,
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function initialize() {
  ensureState()
  const envFile = join(stateRoot, '.env.cloudflare')
  if (!existsSync(envFile)) {
    copyFileSync(join(runtimeRoot, 'templates', '.env.cloudflare.example'), envFile)
    console.log(`Created ${envFile}`)
  } else {
    console.log(`Cloudflare env already exists: ${envFile}`)
  }
  console.log('Add CF_READ_TOKEN locally. Never paste it into chat or commit it.')
}

function syncDashboard() {
  const source = join(runtimeRoot, 'dashboard')
  const destination = join(stateRoot, 'dashboard')
  cpSync(source, destination, {
    recursive: true,
    force: true,
    filter: (sourcePath) => {
      const normalized = sourcePath.replaceAll('\\', '/')
      return !normalized.includes('/node_modules/')
        && !normalized.includes('/dist/')
        && !normalized.includes('/public/data/')
    },
  })
  mkdirSync(join(destination, 'public', 'data'), { recursive: true })
  return destination
}

function help() {
  console.log(`Cloudflare Maxxing

Usage:
  node cf-maxxing.mjs [--project=<path>] <command> [args]

State:
  <project>/.cloudflare-maxxing/

Commands:
  init                 Create the namespaced local env and state directory
  setup                Verify the read-only Cloudflare token
  refresh              Snapshot, report, beta advice, and dashboard data
  snapshot             Capture current account state
  report               Generate findings from the latest snapshot
  diff [old new]       Compare two snapshots
  betas                Score relevant Cloudflare betas
  capabilities         Inspect token capabilities with read-only requests
  resolve [args]       Resolve a pseudonymous alias locally
  dashboard            Open the local dashboard
  dashboard:build      Build the local dashboard
  action <name> [...]  Run an allowlisted guarded action; dry-run by default
  where                Print the project and state paths

Actions:
  ${[...allowedActions].join(', ')}
`)
}

ensureState()

switch (command) {
  case 'help':
  case '--help':
  case '-h':
    help()
    break
  case 'init':
    initialize()
    break
  case 'setup':
    initialize()
    runNode('setup.mjs')
    break
  case 'snapshot':
    runNode('snapshot.mjs', rawArgs)
    break
  case 'report':
    runNode('report.mjs', rawArgs)
    break
  case 'diff':
    runNode('diff.mjs', rawArgs)
    break
  case 'betas':
    runNode('betas.mjs', rawArgs)
    break
  case 'capabilities':
    runNode('capabilities.mjs', rawArgs, { allowBreakGlass: true })
    break
  case 'resolve':
    runNode('resolve.mjs', rawArgs)
    break
  case 'refresh':
    runNode('snapshot.mjs')
    runNode('report.mjs')
    runNode('betas.mjs')
    runNode('build-dashboard-data.mjs')
    runNode('build-actions.mjs')
    break
  case 'dashboard': {
    const dashboardRoot = syncDashboard()
    runNpm(['ci'], dashboardRoot)
    runNpm(['run', 'dev'], dashboardRoot)
    break
  }
  case 'dashboard:build': {
    const dashboardRoot = syncDashboard()
    runNpm(['ci'], dashboardRoot)
    runNpm(['run', 'build'], dashboardRoot)
    break
  }
  case 'action': {
    const action = rawArgs.shift()
    if (!allowedActions.has(action)) {
      console.error(`Unknown or unbundled action: ${action || '(missing)'}`)
      console.error(`Allowed actions: ${[...allowedActions].join(', ')}`)
      process.exit(2)
    }
    runNode(join('actions', `${action}.mjs`), rawArgs, { allowBreakGlass: true })
    break
  }
  case 'where':
    console.log(JSON.stringify({ projectRoot, stateRoot, runtimeRoot }, null, 2))
    break
  default:
    console.error(`Unknown command: ${command}`)
    help()
    process.exit(2)
}
