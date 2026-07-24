import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('capability discovery does not send write-shaped probes', async () => {
  const source = await readFile(new URL('../scripts/capabilities.mjs', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /\bep\s*:/)
  assert.doesNotMatch(source, /\bNX\b/)
  assert.doesNotMatch(source, /cli\.raw\(\s*s\./)

  const literalMethods = [...source.matchAll(/cli\.raw\(\s*['"]([A-Z]+)['"]/g)]
    .map((match) => match[1])
  assert.deepEqual([...new Set(literalMethods)], ['GET'])
})
