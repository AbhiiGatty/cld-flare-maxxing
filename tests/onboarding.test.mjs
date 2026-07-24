import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

async function text(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

test('Claude Code and Codex ship the same project skill', async () => {
  for (const file of ['SKILL.md', 'platform-map.md', 'use-cases.md']) {
    const claude = await text(`../.claude/skills/cloudflare-maxxing/${file}`)
    const codex = await text(`../.agents/skills/cloudflare-maxxing/${file}`)
    assert.equal(claude, codex, `${file} differs between Claude Code and Codex`)
  }
})

test('normal user commands never build or deploy the public website', async () => {
  const pkg = JSON.parse(await text('../package.json'))
  for (const name of ['setup', 'snapshot', 'report', 'diff', 'betas', 'build-data', 'refresh', 'dashboard', 'test']) {
    assert.ok(pkg.scripts[name], `missing ${name} script`)
    assert.doesNotMatch(pkg.scripts[name], /\bsite\b|pages-deploy|wrangler\s+pages/i, `${name} touches the website`)
  }

  const workflow = await text('../.github/workflows/daily-snapshot.yml')
  assert.doesNotMatch(workflow, /CF_EDIT_TOKEN|pages-deploy-site|wrangler\s+pages/i)
})

test('optional MCP configuration uses only current low-overhead servers', async () => {
  const config = JSON.parse(await text('../.mcp.json'))
  assert.deepEqual(Object.keys(config.mcpServers).sort(), ['cloudflare', 'cloudflare-docs'])
  for (const server of Object.values(config.mcpServers)) {
    assert.equal(server.type, 'http')
    assert.match(server.url, /\/mcp$/)
    assert.doesNotMatch(server.url, /\/sse$/)
  }
})

test('onboarding starts read-only and keeps edit access optional', async () => {
  const readme = await text('../README.md')
  const tokenSetup = await text('../docs/TOKEN-SETUP.md')
  const claude = await text('../CLAUDE.md')

  assert.match(readme, /Do not create an edit token/)
  assert.match(readme, /do not need to run `npm install`/)
  assert.doesNotMatch(readme, /two Cloudflare API tokens it needs/i)
  assert.match(tokenSetup, /Start with \*\*one read-only token\*\*/)
  assert.match(tokenSetup, /second token is optional/)
  assert.match(claude, /^# Claude Code layer[\s\S]*@AGENTS\.md/)
  assert.doesNotMatch(claude, /caveman/i)
  assert.ok(Buffer.byteLength(claude) < 5000, 'CLAUDE.md duplicates too much shared guidance')
})
