import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('break-glass refuses to arm if its audit record cannot be persisted', async () => {
  const source = await readFile(new URL('../scripts/lib/guard.mjs', import.meta.url), 'utf8')

  assert.match(source, /audit\(\{ action, status: 'ARMED', details \}, \{ required: true \}\)/)
  assert.match(source, /if \(required\) throw/)
})
