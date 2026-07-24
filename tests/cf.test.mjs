import assert from 'node:assert/strict'
import test from 'node:test'
import { CFError, makeClient } from '../scripts/lib/cf.mjs'

function apiResponse(status, result = null) {
  const ok = status >= 200 && status < 300
  return new Response(JSON.stringify(ok
    ? { success: true, result }
    : { success: false, errors: [{ message: `status ${status}` }] }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

test('retries reads but never retries a mutating request', async () => {
  const previousFetch = globalThis.fetch

  try {
    let postAttempts = 0
    globalThis.fetch = async () => {
      postAttempts++
      return apiResponse(postAttempts === 1 ? 500 : 400)
    }

    const client = makeClient({ token: 'test-token' })
    await assert.rejects(
      client.raw('POST', '/accounts/test/resource', { body: { enabled: true } }),
      CFError,
    )
    assert.equal(postAttempts, 1)

    let getAttempts = 0
    globalThis.fetch = async () => {
      getAttempts++
      return getAttempts === 1 ? apiResponse(500) : apiResponse(200, { ok: true })
    }

    const result = await client.raw('GET', '/accounts/test/resource')
    assert.deepEqual(result.result, { ok: true })
    assert.equal(getAttempts, 2)
  } finally {
    globalThis.fetch = previousFetch
  }
})
