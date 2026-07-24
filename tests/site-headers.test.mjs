import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('landing page declares the public security headers', async () => {
  const headers = await readFile(new URL('../site/_headers', import.meta.url), 'utf8')

  for (const name of [
    'Content-Security-Policy:',
    'Strict-Transport-Security:',
    'Permissions-Policy:',
    'X-Content-Type-Options:',
    'Referrer-Policy:',
    'X-Frame-Options:',
  ]) {
    assert.match(headers, new RegExp(`^\\s+${name}`, 'm'))
  }
  assert.match(headers, /frame-ancestors 'none'/)
})

test('landing page get-started flow is plugin-first', async () => {
  const page = await readFile(new URL('../site/index.html', import.meta.url), 'utf8')

  assert.match(page, /claude plugin marketplace add/)
  assert.match(page, /claude plugin install/)
  assert.match(page, /\.cloudflare-maxxing\/\.env\.cloudflare/)
  assert.doesNotMatch(page, /\$ git clone/)
  assert.doesNotMatch(page, /\$ npm run setup/)
})
