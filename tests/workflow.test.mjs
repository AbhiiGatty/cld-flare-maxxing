import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('daily snapshot workflow opens a PR with pinned actions and minimal permissions', async () => {
  const workflow = await readFile(new URL('../.github/workflows/daily-snapshot.yml', import.meta.url), 'utf8')

  assert.match(workflow, /contents:\s*read/)
  assert.match(workflow, /pull-requests:\s*write/)
  assert.doesNotMatch(workflow, /\bgit push\b/)
  assert.doesNotMatch(workflow, /uses:\s*actions\/[^@\s]+@v\d+/)
  assert.match(workflow, /uses:\s*peter-evans\/create-pull-request@[0-9a-f]{40}/)
})

test('pull request CI is read-only and receives no Cloudflare secrets', async () => {
  const workflow = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')

  assert.match(workflow, /^permissions:\s*\n\s+contents: read/m)
  assert.match(workflow, /pull_request:/)
  assert.match(workflow, /npm test/)
  assert.match(workflow, /npm audit --audit-level=high/)
  assert.match(workflow, /npm --prefix dashboard run build/)
  assert.doesNotMatch(workflow, /CF_(?:READ|EDIT)_TOKEN|CF_ALLOW_DESTRUCTIVE/)
  assert.doesNotMatch(workflow, /uses:\s+[^@\s]+@(?![0-9a-f]{40}\b)/)
})
