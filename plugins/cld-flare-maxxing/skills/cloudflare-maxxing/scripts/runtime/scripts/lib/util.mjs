// Small dependency-free utilities shared across scripts.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'

/** Parse a .env-style file into process.env. Existing env vars win (not overwritten). */
export function loadEnv(file) {
  if (!existsSync(file)) return {}
  const loaded = {}
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    loaded[key] = val
    if (process.env[key] === undefined || process.env[key] === '') process.env[key] = val
  }
  return loaded
}

export function ensureDir(path) {
  mkdirSync(path, { recursive: true })
}

export function writeJson(file, obj) {
  ensureDir(dirname(file))
  writeFileSync(file, JSON.stringify(obj, null, 2) + '\n')
}

export function readJson(file, fallback = null) {
  try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return fallback }
}

/** Filesystem-safe UTC stamp, e.g. 2026-06-17T12-30-00Z */
export function stamp(d = new Date()) {
  return d.toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, 'Z')
}

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', red: '\x1b[31m', green: '\x1b[32m',
  yellow: '\x1b[33m', cyan: '\x1b[36m', bold: '\x1b[1m',
}
const tag = (c, t) => `${c}${t}${C.reset}`
export const log = {
  info: (...a) => console.log(tag(C.cyan, 'ℹ'), ...a),
  ok: (...a) => console.log(tag(C.green, '✓'), ...a),
  warn: (...a) => console.warn(tag(C.yellow, '⚠'), ...a),
  err: (...a) => console.error(tag(C.red, '✗'), ...a),
  step: (...a) => console.log(tag(C.bold, '▶'), ...a),
  dim: (...a) => console.log(tag(C.dim, a.join(' '))),
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/** Defensive secret redaction for anything we persist. We never request token
 *  values, but strip anything that looks like a credential just in case. */
const SECRET_KEYS = /(token|secret|password|api_key|apikey|private_key|client_secret|bearer)/i
export function redact(value) {
  if (Array.isArray(value)) return value.map(redact)
  if (value && typeof value === 'object') {
    // Cloudflare env-var shape { value, type: "plain_text"|"secret_text" }: the
    // secret lives under the generic "value" key, which the key-name check below
    // would miss — redact it explicitly (keeps the var name + type for inventory).
    const isEnvVar = typeof value.value === 'string' && (value.type === 'plain_text' || value.type === 'secret_text')
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      if (isEnvVar && k === 'value') out[k] = '«redacted»'
      else out[k] = SECRET_KEYS.test(k) && typeof v === 'string' && v.length > 8 ? '«redacted»' : redact(v)
    }
    return out
  }
  return value
}
