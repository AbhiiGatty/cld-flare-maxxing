import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const hooksUrl = new URL('../.codex/hooks.json', import.meta.url)

test('Codex hooks use portable Git-root paths', async () => {
  const source = await readFile(hooksUrl, 'utf8')
  const config = JSON.parse(source)
  const groups = config.hooks.PreToolUse

  assert.ok(Array.isArray(groups) && groups.length > 0)
  for (const group of groups) {
    for (const hook of group.hooks) {
      assert.match(hook.command, /git rev-parse --show-toplevel/)
      assert.match(hook.commandWindows, /git rev-parse --show-toplevel/)
      assert.doesNotMatch(hook.command, /[A-Z]:\\Users\\/i)
      assert.doesNotMatch(hook.commandWindows, /[A-Z]:\\Users\\/i)
    }
  }
})
