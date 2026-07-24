// Minimal, dependency-free Cloudflare REST + GraphQL client.
// Two token modes: 'read' (default, snapshots/reports) and 'edit' (break-glass).
import { log, sleep } from './util.mjs'
import { DIRS } from './paths.mjs'

const API = 'https://api.cloudflare.com/client/v4'
const GRAPHQL = 'https://api.cloudflare.com/client/v4/graphql'

export class CFError extends Error {
  constructor(message, { status, errors, path } = {}) {
    super(message)
    this.name = 'CFError'
    this.status = status
    this.errors = errors
    this.path = path
  }
}

export function getToken(mode = 'read') {
  if (mode === 'edit') {
    const t = process.env.CF_EDIT_TOKEN
    if (!t) throw new Error(`CF_EDIT_TOKEN not set; add it to ${DIRS.breakGlassEnv} only for an approved change.`)
    return t
  }
  const t = process.env.CF_READ_TOKEN || process.env.CF_API_TOKEN
  if (!t) throw new Error(`CF_READ_TOKEN not set in ${DIRS.env}. Run the setup command first.`)
  return t
}

export function makeClient({ mode = 'read', token } = {}) {
  token = token || getToken(mode)

  async function raw(method, path, { query, body, headers } = {}) {
    const verb = String(method).toUpperCase()
    const retryable = verb === 'GET' || verb === 'HEAD' || verb === 'OPTIONS'
    const url = new URL(API + path)
    if (query) for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
    for (let attempt = 1; ; attempt++) {
      let res
      try {
        res = await fetch(url, {
          method: verb,
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers },
          body: body != null ? JSON.stringify(body) : undefined,
        })
      } catch (e) {
        if (retryable && attempt <= 4) { await sleep(500 * attempt); continue }
        throw new CFError(`network error on ${verb} ${path}: ${e.message}`, { path })
      }
      if (retryable && (res.status === 429 || res.status >= 500) && attempt <= 5) {
        await sleep(800 * attempt)
        continue
      }
      const text = await res.text()
      let json = null
      try { json = text ? JSON.parse(text) : null } catch { /* non-json */ }
      if (!res.ok || (json && json.success === false)) {
        const errs = json?.errors?.length ? json.errors : [{ message: text || res.statusText }]
        throw new CFError(
          `${verb} ${path} → ${res.status}: ${errs.map((e) => e.message || JSON.stringify(e)).join('; ')}`,
          { status: res.status, errors: errs, path }
        )
      }
      return json
    }
  }

  // Single result (object or array under .result)
  async function get(path, opts) {
    const j = await raw('GET', path, opts)
    return j ? j.result : null
  }

  // Page-based pagination (page / per_page / result_info.total_pages)
  async function getAll(path, { query = {} } = {}) {
    const per_page = query.per_page || 50
    const out = []
    for (let page = 1; page <= 500; page++) {
      const j = await raw('GET', path, { query: { ...query, page, per_page } })
      const result = j?.result || []
      out.push(...result)
      const info = j?.result_info
      if (!info) break
      const totalPages = info.total_pages ?? (info.total_count ? Math.ceil(info.total_count / (info.per_page || per_page)) : page)
      if (result.length === 0 || page >= totalPages) break
    }
    return out
  }

  // Cursor-based pagination (R2 buckets, audit logs v2, etc.)
  async function getCursor(path, { query = {}, cursorParam = 'cursor' } = {}) {
    const out = []
    let cursor
    for (let i = 0; i < 5000; i++) {
      const q = { ...query }
      if (cursor) q[cursorParam] = cursor
      const j = await raw('GET', path, { query: q })
      const raw_result = j?.result
      // Most cursor endpoints return an array under .result; R2 buckets returns
      // an object { buckets: [...] } (and .objects for some list endpoints).
      const result = Array.isArray(raw_result) ? raw_result : (raw_result?.buckets || raw_result?.objects || [])
      out.push(...result)
      cursor = j?.result_info?.cursor || j?.result_info?.cursors?.after || raw_result?.cursor
      if (!cursor || result.length === 0) break
    }
    return out
  }

  async function graphql(query, variables) {
    const res = await fetch(GRAPHQL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok || json?.errors?.length) {
      throw new CFError(`GraphQL error: ${JSON.stringify(json?.errors || res.statusText)}`, { status: res.status })
    }
    return json?.data
  }

  return { token, mode, raw, get, getAll, getCursor, graphql }
}

export async function resolveAccountId(client) {
  if (process.env.CF_ACCOUNT_ID) return process.env.CF_ACCOUNT_ID
  const accounts = await client.getAll('/accounts', { query: { per_page: 50 } })
  if (!accounts.length) throw new Error('No accounts visible to this token. Check token scopes (Account Settings:Read).')
  if (accounts.length > 1) {
    log.warn(`Token sees ${accounts.length} accounts; defaulting to "${accounts[0].name}". Set CF_ACCOUNT_ID in .env to pin one.`)
  }
  return accounts[0].id
}
