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
