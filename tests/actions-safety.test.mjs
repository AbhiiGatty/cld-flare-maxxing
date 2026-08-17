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
    'dpdpa-landing-deploy.mjs',
    'dpdpa-metrics-smoke-cleanup.mjs',
    'gattyworks-metrics-deploy.mjs',
    'jan-aushadhi-metrics-onboard.mjs',
    'jan-aushadhi-phone-migration.mjs',
    'jan-aushadhi-turnstile-provision.mjs',
    'jan-aushadhi-deploy.mjs',
    'metrics-turnstile-dpdpa-hostname.mjs',
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

test('Jan Aushadhi Metrics onboarding is pinned to two projects and one D1 source', async () => {
  const source = await readFile(new URL('jan-aushadhi-metrics-onboard.mjs', actionsDir), 'utf8')

  assert.match(source, /const EXPECTED_DATABASE = 'gattyworks-metrics'/)
  assert.match(source, /id: 'jan-aushadhi-dost'/)
  assert.match(source, /origin: 'https:\/\/india-aushadi\.gattyworks\.com'/)
  assert.match(source, /id: 'jan-aushadhi-dost-alias'/)
  assert.match(source, /origin: 'https:\/\/aushadhi\.gattyworks\.com'/)
  assert.match(source, /Object\.keys\(args\)\.some\(\(key\) => key !== 'commit'\)/)
  assert.match(source, /rawArgs\.length > 1/)
  assert.match(source, /const APPROVED_FILES = Object\.freeze/)
  assert.match(source, /approved Metrics source fingerprint changed/)
  assert.doesNotMatch(source, /[a-z0-9._%+-]+@gattyworks\.com/i)
})

test('Jan Aushadhi Metrics preflight finishes before break-glass and child receives only scoped Cloudflare credentials', async () => {
  const source = await readFile(new URL('jan-aushadhi-metrics-onboard.mjs', actionsDir), 'utf8')
  const dependencyCheck = source.indexOf("run('install locked GattyWorks Metrics dependencies'")
  const typecheck = source.indexOf("run('typecheck GattyWorks Metrics'")
  const editBoot = source.indexOf('const cf = bootEdit')
  const onboard = source.indexOf('run(`register Metrics project ${project.id}`')

  assert.ok(dependencyCheck >= 0)
  assert.ok(typecheck > dependencyCheck)
  assert.ok(editBoot > typecheck)
  assert.ok(onboard > editBoot)
  assert.match(source, /installedWrangler !== approved\.lockedWrangler/)
  assert.match(source, /wranglerExecutable\(EXPECTED_SOURCE\)/)
  assert.match(source, /CLOUDFLARE_API_TOKEN: cf\.token/)
  assert.match(source, /CLOUDFLARE_ACCOUNT_ID: accountId/)
  assert.match(source, /npm_config_offline: 'true'/)
  assert.doesNotMatch(source, /process\.stdout\.write/)
})

test('Jan Aushadhi Turnstile provisioning is fixed-scope and keeps the widget secret out of output', async () => {
  const source = await readFile(new URL('jan-aushadhi-turnstile-provision.mjs', actionsDir), 'utf8')

  assert.match(source, /const EXPECTED_WORKER = 'jan-aushadhi-finder'/)
  assert.match(source, /const EXPECTED_WIDGET_NAME = 'jan-aushadhi-price-watch'/)
  assert.match(source, /const EXPECTED_SHARED_METRICS_SITEKEY = '0x4AAAAAAEI3WFeNzqlNq0gN'/)
  assert.match(source, /'india-aushadi\.gattyworks\.com'/)
  assert.match(source, /'aushadhi\.gattyworks\.com'/)
  assert.match(source, /const APPROVED_FILES = Object\.freeze/)
  assert.match(source, /approved Jan Aushadhi source fingerprint changed/)
  assert.match(source, /invalidate_immediately: true/)
  assert.match(source, /\['secret', 'put', 'TURNSTILE_SECRET_KEY', '--name', EXPECTED_WORKER\]/)
  assert.match(source, /`\$\{widgetSecret\}\\n`/)
  assert.match(source, /JSON\.stringify\(safeProjection\(observed\.widget\)\)/)
  assert.match(source, /widgetUpdateWithoutJanDomains/)
  assert.match(source, /JSON\.stringify\(safe\)/)
  assert.doesNotMatch(source, /log\.(info|ok|warn|err)\([^\n]*widgetSecret/)
  assert.doesNotMatch(source, /audit\([^\n]*widgetSecret/)

  const dryRun = source.indexOf('if (!commit)')
  const editBoot = source.indexOf('const cf = bootEdit')
  const mutation = source.indexOf("response = await cf.raw('POST'")
  const secretInstall = source.indexOf("'install fixed Worker Turnstile secret'")
  assert.ok(dryRun >= 0)
  assert.ok(editBoot > dryRun)
  assert.ok(mutation > editBoot)
  assert.ok(secretInstall > mutation)
})

test('Jan Aushadhi phone migration is pinned and verifies the remote state', async () => {
  const source = await readFile(new URL('jan-aushadhi-phone-migration.mjs', actionsDir), 'utf8')

  assert.match(source, /const EXPECTED_DATABASE = 'jan-aushadhi-subscribers'/)
  assert.match(source, /const EXPECTED_CONTACT_MIGRATIONS = Object\.freeze/)
  assert.match(source, /0003_price_watch_phone_requests\.sql/)
  assert.match(source, /0004_price_watch_email_requests\.sql/)
  assert.match(source, /const EXPECTED_MIGRATIONS = Object\.freeze/)
  assert.match(source, /approved Jan Aushadhi source fingerprint changed/)
  assert.match(source, /\['d1', 'migrations', 'apply', EXPECTED_DATABASE, '--remote'\]/)
  assert.match(source, /CI: '1'/)

  const readBoot = source.indexOf('const read = bootRead()')
  const observed = source.indexOf("'inspect fixed remote D1 migration'")
  const dryRun = source.indexOf('if (!commit)')
  const editBoot = source.indexOf('const cf = bootEdit')
  const apply = source.indexOf("'apply fixed manual price-watch migrations'")
  const verify = source.indexOf("'verify fixed manual price-watch migrations'")
  assert.ok(readBoot >= 0)
  assert.ok(observed > readBoot)
  assert.ok(dryRun > observed)
  assert.ok(editBoot > dryRun)
  assert.ok(apply > editBoot)
  assert.ok(verify > apply)
})

test('Jan Aushadhi deploy pins the source tree and verifies both fixed domains', async () => {
  const source = await readFile(new URL('jan-aushadhi-deploy.mjs', actionsDir), 'utf8')

  assert.match(source, /const EXPECTED_WORKER = 'jan-aushadhi-finder'/)
  assert.match(source, /const EXPECTED_DATABASE = 'jan-aushadhi-subscribers'/)
  assert.match(source, /const APPROVED_SOURCE_HASH = '[0-9a-f]{64}'/)
  assert.match(source, /'india-aushadi\.gattyworks\.com'/)
  assert.match(source, /'aushadhi\.gattyworks\.com'/)
  assert.match(source, /PUBLIC_TURNSTILE_SITE_KEY: sitekey/)
  assert.match(source, /html\.includes\('price-watch follow-up'\)/)
  assert.match(source, /\[executable, 'deploy', '--message'/)

  const dryRun = source.indexOf('if (!commit)')
  const editBoot = source.indexOf('const cf = bootEdit')
  const deploy = source.indexOf("'deploy fixed Jan Aushadhi Worker'")
  const verify = source.indexOf('await verifyLive(sitekey)')
  assert.ok(dryRun >= 0)
  assert.ok(editBoot > dryRun)
  assert.ok(deploy > editBoot)
  assert.ok(verify > deploy)
})

test('GattyWorks Metrics deploy pins runtime inputs and verifies the local origin', async () => {
  const source = await readFile(new URL('gattyworks-metrics-deploy.mjs', actionsDir), 'utf8')

  assert.match(source, /const EXPECTED_WORKER = 'gattyworks-metrics'/)
  assert.match(source, /const EXPECTED_DOMAIN = 'metrics\.gattyworks\.com'/)
  assert.match(source, /const EXPECTED_DATABASE = 'gattyworks-metrics'/)
  assert.match(source, /'src\/index\.ts': '[0-9a-f]{64}'/)
  assert.match(source, /'src\/mcp\.ts': '[0-9a-f]{64}'/)
  assert.match(source, /'dashboard\/beacon\.js': '[0-9a-f]{64}'/)
  assert.match(source, /'dashboard\/index\.html': '[0-9a-f]{64}'/)
  assert.match(source, /approved Metrics deployment fingerprint changed/)
  assert.match(source, /'http:\/\/127\.0\.0\.1:4322'/)

  const dependencyCheck = source.indexOf("run('install locked GattyWorks Metrics dependencies'")
  const typecheck = source.indexOf("run('typecheck GattyWorks Metrics'")
  const dryRunCheck = source.indexOf("run('run pinned GattyWorks Metrics deploy dry run'")
  const dryRun = source.indexOf('if (!commit)')
  const editBoot = source.indexOf('const cf = bootEdit')
  const deploy = source.indexOf("'deploy fixed GattyWorks Metrics Worker'")
  const verification = source.indexOf('await verifyLocalOrigin()')
  assert.ok(dependencyCheck >= 0)
  assert.ok(typecheck > dependencyCheck)
  assert.ok(dryRunCheck > typecheck)
  assert.ok(dryRun > dryRunCheck)
  assert.ok(editBoot > dryRun)
  assert.ok(deploy > editBoot)
  assert.ok(verification > deploy)
})

test('DPDPA landing deployment is pinned to one static-assets target', async () => {
  const source = await readFile(new URL('dpdpa-landing-deploy.mjs', actionsDir), 'utf8')

  assert.match(source, /const EXPECTED_WORKER = 'gattyworks-dpdpa'/)
  assert.match(source, /const EXPECTED_DOMAIN = 'dpdpa\.gattyworks\.com'/)
  assert.match(source, /config\.workers_dev !== false/)
  assert.match(source, /config\.preview_urls !== false/)
  assert.match(source, /routes\.length !== 1/)
  assert.match(source, /route\.custom_domain !== true/)
  assert.match(source, /assets\.directory !== EXPECTED_ASSET_DIRECTORY/)
  assert.match(source, /unexpectedTopLevel\.length/)
  assert.match(source, /'main' in config/)
  assert.match(source, /assertNoSymlinks\(assetDirectory\)/)
  assert.match(source, /const allowedArgs = new Set\(\['source', 'worker', 'domain', 'commit'\]\)/)
  assert.match(source, /seenArgs\.has\(key\)/)
})

test('DPDPA landing checks finish before break-glass and deploy uses the target lockfile', async () => {
  const source = await readFile(new URL('dpdpa-landing-deploy.mjs', actionsDir), 'utf8')
  const dependencyCheck = source.indexOf("run('install locked DPDPA landing dependencies'")
  const dryRunCheck = source.indexOf("run('run DPDPA landing Wrangler dry run'")
  const editBoot = source.indexOf('const cf = bootEdit')

  assert.ok(dependencyCheck >= 0)
  assert.ok(dryRunCheck > dependencyCheck)
  assert.ok(editBoot > dryRunCheck)
  assert.match(source, /installedWrangler !== lockedWrangler/)
  assert.match(source, /wranglerExecutable\(source\)/)
  assert.match(source, /CLOUDFLARE_API_TOKEN: cf\.token/)
  assert.match(source, /CLOUDFLARE_ACCOUNT_ID: accountId/)
})

test('DPDPA Metrics smoke cleanup is fixed to one synthetic email event', async () => {
  const source = await readFile(new URL('dpdpa-metrics-smoke-cleanup.mjs', actionsDir), 'utf8')

  assert.match(source, /const DATABASE_NAME = 'gattyworks-metrics'/)
  assert.match(source, /const PROJECT_ID = 'dpdpa-skill'/)
  assert.match(source, /const EVENT_TYPE = 'email'/)
  assert.match(source, /const SYNTHETIC_EMAIL = 'dpdpa-smoke-1786789394070@example\.com'/)
  assert.match(source, /Object\.keys\(args\)\.some\(\(key\) => key !== 'commit'\)/)
  assert.match(source, /rawArgs\.length > 1/)
  assert.match(source, /SELECT COUNT\(\*\) AS match_count/)
  assert.match(source, /DELETE FROM events/)
  assert.match(source, /AND project_id = \?/)
  assert.match(source, /AND type = \?/)
  assert.match(source, /AND email = \?/)
  assert.match(source, /RETURNING id/)
  assert.doesNotMatch(source, /args\.(database|project|type|email|sql)/)
})

test('DPDPA Metrics smoke cleanup proves one row before loading break-glass', async () => {
  const source = await readFile(new URL('dpdpa-metrics-smoke-cleanup.mjs', actionsDir), 'utf8')
  const readBoot = source.indexOf('const read = bootRead()')
  const readInspection = source.indexOf('const readInspection = await inspectTarget')
  const exactRead = source.indexOf("assertExactlyOne(readInspection, 'read preflight')")
  const dryRun = source.indexOf('if (!commit)')
  const editBoot = source.indexOf('const cf = bootEdit')
  const editInspection = source.indexOf('const editInspection = await inspectTarget')
  const deletion = source.indexOf('DELETE FROM events')
  const verification = source.lastIndexOf('const after = await inspectTarget')

  assert.ok(readBoot >= 0)
  assert.ok(readInspection > readBoot)
  assert.ok(exactRead > readInspection)
  assert.ok(dryRun > exactRead)
  assert.ok(editBoot > dryRun)
  assert.ok(editInspection > editBoot)
  assert.ok(deletion > editInspection)
  assert.ok(verification > deletion)
})

test('Metrics Turnstile action is pinned and logs safe projections only', async () => {
  const source = await readFile(new URL('metrics-turnstile-dpdpa-hostname.mjs', actionsDir), 'utf8')

  assert.match(source, /const EXPECTED_WIDGET_NAME = 'metrics-gattyworks'/)
  assert.match(source, /const EXPECTED_SITEKEY = '0x4AAAAAAEI3WFeNzqlNq0gN'/)
  assert.match(source, /const METRICS_HOSTNAME = 'metrics\.gattyworks\.com'/)
  assert.match(source, /const DPDPA_HOSTNAME = 'dpdpa\.gattyworks\.com'/)
  assert.match(source, /const BEFORE_DOMAINS = Object\.freeze\(\[METRICS_HOSTNAME\]\)/)
  assert.match(source, /const AFTER_DOMAINS = Object\.freeze\(\[METRICS_HOSTNAME, DPDPA_HOSTNAME\]\)/)
  assert.match(source, /Object\.keys\(args\)\.some\(\(key\) => key !== 'commit'\)/)
  assert.match(source, /rawArgs\.length > 1/)
  assert.match(source, /await cf\.raw\('PUT', endpoint/)
  assert.doesNotMatch(source, /cf\.raw\('PATCH'/)
  assert.doesNotMatch(source, /\.secret\b/)
  assert.equal([...source.matchAll(/JSON\.stringify\(/g)].length, 1)
  assert.match(source, /JSON\.stringify\(safeProjection\(widget\)\)/)

  const preflight = source.indexOf('const current = await readWidget(cf, editAccountId)')
  const update = source.indexOf("const update = await cf.raw('PUT', endpoint")
  const verification = source.indexOf('const verified = await readWidget(cf, editAccountId)')
  assert.ok(preflight >= 0)
  assert.ok(update > preflight)
  assert.ok(verification > update)

  const bodyStart = source.indexOf('body: {', update)
  const bodyEnd = source.indexOf('\n    },', bodyStart)
  const updateBody = source.slice(bodyStart, bodyEnd)
  assert.doesNotMatch(updateBody, /\bregion\b/)
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
  assert.match(deploy, /process\.platform === 'win32' \? process\.execPath : npmExecutable\(\)/)
  assert.match(deploy, /node_modules', 'npm', 'bin', 'npm-cli\.js'/)
  assert.ok(secrets.indexOf("spawnSync(npmExecutable()") < secrets.indexOf('const cf = bootEdit'))
})

test('Deep Research stages required secrets before new Worker code', async () => {
  const source = await readFile(new URL('deep-research-deploy.mjs', actionsDir), 'utf8')
  const secretInstall = source.indexOf("'install required Worker secrets'")
  const deploy = source.indexOf("'deploy Worker and Custom Domain'")

  assert.ok(secretInstall >= 0)
  assert.ok(deploy > secretInstall)
  assert.match(source, /'PROVIDER_CREDENTIAL_KEY'/)
  assert.match(source, /randomBytes\(32\)\.toString\('base64url'\)/)
  assert.match(source, /suppressOutput: true/)
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
