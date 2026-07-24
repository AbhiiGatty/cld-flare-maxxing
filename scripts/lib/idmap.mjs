// Pseudonymization engine for anything derived from the live Cloudflare account
// that might get committed. Turns real resource ids, domains, resource names,
// emails, and origin IPs into deterministic aliases (same real value -> same
// alias, every run, forever) and keeps a local, gitignored vault mapping
// alias -> real so the account owner can reverse any alias offline.
//
// Two entry points:
//   aliasSnapshot(raw, vault)   - full pass over a raw snapshot object. Mints
//                                 new vault entries as it finds new real
//                                 values (structural fields first, then a
//                                 regex catch-all), then rewrites the tree.
//   scrubText(value, vault)     - substitution-only pass for anything ELSE
//                                 that might get committed (config/*.json,
//                                 dashboard/public/data/*.json). Uses the
//                                 vault built by aliasSnapshot; does not mint
//                                 new entries, so it never disagrees with the
//                                 snapshot's aliases for the same real value.
//
// The vault is the reversal key, alongside CF_ALIAS_SALT. Both are personal,
// gitignored, and needed together to go from an alias back to a real value —
// or the vault can be rebuilt from scratch by re-running aliasSnapshot against
// a fresh live capture with the same salt (deterministic hashing).
import { createHmac, createHash, randomBytes } from 'node:crypto'
import { existsSync, appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DIRS } from './paths.mjs'
import { readJson, writeJson, log } from './util.mjs'

export const VAULT_FILE = join(DIRS.root, 'secrets', 'alias-map.json')
const ENV_FILE = join(DIRS.root, '.env')

// ── salt ──────────────────────────────────────────────────────────────────
/** Load CF_ALIAS_SALT from the environment, or mint + persist one into .env. */
export function ensureSalt() {
  if (process.env.CF_ALIAS_SALT) return process.env.CF_ALIAS_SALT
  if (!existsSync(ENV_FILE)) {
    throw new Error('No .env found. Run `npm run setup` first (CF_ALIAS_SALT is generated alongside your read token).')
  }
  const salt = randomBytes(32).toString('hex')
  appendFileSync(ENV_FILE, `\n# Auto-generated — keys the pseudonymization in scripts/lib/idmap.mjs.\n# Losing this makes the alias-map.json vault (and every alias in committed\n# snapshots) unrecoverable from the salt alone; the vault itself still works.\nCF_ALIAS_SALT=${salt}\n`)
  process.env.CF_ALIAS_SALT = salt
  log.warn('CF_ALIAS_SALT was missing — generated one and appended it to .env. Back this up alongside secrets/alias-map.json.')
  return salt
}

function hmac(input) {
  return createHmac('sha256', Buffer.from(ensureSalt(), 'hex')).update(input).digest('hex')
}

// ── vault ─────────────────────────────────────────────────────────────────
export function loadVault() {
  const v = readJson(VAULT_FILE, null)
  if (v && v.version === 1) return v
  return { version: 1, saltFingerprint: null, entries: {} }
}

export function saveVault(vault) {
  vault.saltFingerprint = createHash('sha256').update(Buffer.from(ensureSalt(), 'hex')).digest('hex').slice(0, 12)
  writeJson(VAULT_FILE, vault)
}

/** In-memory indexes over a loaded vault, for O(1) reuse-lookup during aliasing. */
function buildIndexes(vault) {
  const byRealId = new Map() // normalized hex/uuid -> alias
  const byRealText = new Map() // lowercased exact string (email/domain/name/github) -> alias
  const byRealIP = new Map()
  for (const [alias, e] of Object.entries(vault.entries)) {
    if (e.kind === 'id') byRealId.set(e.real, alias)
    else if (e.kind === 'ip') byRealIP.set(e.real, alias)
    else byRealText.set(`${e.kind}:${e.real.toLowerCase()}`, alias)
    // ids minted with a pretty kind prefix (zone, account, worker, ...) are
    // still id-shaped and must be reusable from the generic regex pass too.
    if (ID_KINDS.has(e.kind)) byRealId.set(e.real, alias)
  }
  return { byRealId, byRealText, byRealIP }
}

const ID_KINDS = new Set([
  'id', 'zone', 'account', 'member', 'user', 'policy', 'role', 'subscription',
  'worker', 'kv', 'r2', 'd1', 'queue', 'pages', 'route', 'wafrule', 'cert', 'token', 'ghrepo',
])

function dedupeAlias(prefix, hex, taken) {
  let len = 8
  let candidate = `${prefix}${hex.slice(0, len)}`
  while (taken.has(candidate)) {
    len += 2
    candidate = `${prefix}${hex.slice(0, len)}`
  }
  return candidate
}

function mintId(kind, real, ctx) {
  const norm = real.toLowerCase().replace(/-/g, '')
  const existing = ctx.byRealId.get(norm)
  if (existing) return existing
  const alias = dedupeAlias(`${kind === 'id' ? 'id' : kind}_`, hmac(`id:${norm}`), ctx.taken)
  ctx.vault.entries[alias] = { kind, real: norm }
  ctx.byRealId.set(norm, alias)
  ctx.taken.add(alias)
  ctx.dirty = true
  return alias
}

function mintText(kind, real, ctx, aliasFn) {
  const key = `${kind}:${real.toLowerCase()}`
  const existing = ctx.byRealText.get(key)
  if (existing) return existing
  const hex = hmac(`${kind}:${real.toLowerCase()}`)
  const alias = aliasFn(hex, ctx.taken)
  ctx.vault.entries[alias] = { kind, real }
  ctx.byRealText.set(key, alias)
  ctx.taken.add(alias)
  ctx.dirty = true
  return alias
}

function mintDomain(real, ctx) {
  return mintText('domain', real, ctx, (hex, taken) => dedupeAlias('zone-', hex, taken).replace(/_/, '-') + '.example.com')
}

function mintResourceName(kind, real, ctx) {
  return mintText(kind, real, ctx, (hex, taken) => dedupeAlias(`${kind}-`, hex, taken))
}

function mintEmail(real, ctx) {
  return mintText('email', real, ctx, (hex, taken) => dedupeAlias('user-', hex, taken) + '@example.com')
}

function mintGithub(kind, real, ctx) {
  return mintText(kind, real, ctx, (hex, taken) => dedupeAlias(`${kind}-`, hex, taken))
}

const NON_SENSITIVE_IP = [
  /^0\./, /^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./,
  /^192\.0\.2\./, /^198\.51\.100\./, /^203\.0\.113\./, /^100::/i, /^::1$/, /^fe80:/i, /^f[cd][0-9a-f]{2}:/i,
]
function isNonSensitiveIP(ip) {
  return NON_SENSITIVE_IP.some((re) => re.test(ip))
}

function mintIP(real, ctx) {
  if (isNonSensitiveIP(real)) return null
  const existing = ctx.byRealIP.get(real)
  if (existing) return existing
  const hex = hmac(`ip:${real}`)
  const isV6 = real.includes(':')
  const alias = isV6 ? `2001:db8::${parseInt(hex.slice(0, 4), 16).toString(16)}` : `203.0.113.${parseInt(hex.slice(0, 2), 16)}`
  ctx.vault.entries[alias] = { kind: 'ip', real }
  ctx.byRealIP.set(real, alias)
  ctx.taken.add(alias)
  ctx.dirty = true
  return alias
}

// ── free-text redaction (unbounded prose — replace wholesale, don't try to
//    partially scrub it; that's the field class that's leaked secrets before,
//    see docs/CHANGELOG.md 2026-06-25) ───────────────────────────────────────
const FREE_TEXT_SUFFIXES = [
  ['dnsRecords', 'comment'],
  ['custom', 'description'], ['custom', 'expression'],
  ['rateLimit', 'description'], ['rateLimit', 'expression'],
  ['managed', 'description'], ['managed', 'expression'],
  ['metadata', 'commit_message'],
]
function isFreeTextPath(path) {
  return FREE_TEXT_SUFFIXES.some(([a, b]) => path.length >= 2 && path[path.length - 2] === a && path[path.length - 1] === b)
}

// ── regex catch-alls, applied to every remaining string leaf ────────────────
const RE_HEX64 = /\b[0-9a-f]{64}\b/gi
const RE_HEX40 = /\b[0-9a-f]{40}\b/gi
const RE_UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi
const RE_HEX32 = /\b[0-9a-f]{32}\b/gi
const RE_EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
const RE_IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g
const RE_IPV6 = /\b[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){2,7}\b/gi

function scrubIdsAndPII(str, ctx) {
  if (typeof str !== 'string' || str.length < 6) return str
  let out = str
  for (const re of [RE_HEX64, RE_HEX40, RE_UUID, RE_HEX32]) {
    out = out.replace(re, (m) => (ctx.mint ? mintId('id', m, ctx) : (ctx.byRealId.get(m.toLowerCase().replace(/-/g, '')) || m)))
  }
  out = out.replace(RE_EMAIL, (m) => (ctx.mint ? mintEmail(m, ctx) : (ctx.byRealText.get(`email:${m.toLowerCase()}`) || m)))
  out = out.replace(RE_IPV4, (m) => (ctx.mint ? (mintIP(m, ctx) || m) : (ctx.byRealIP.get(m) || m)))
  out = out.replace(RE_IPV6, (m) => (ctx.mint ? (mintIP(m, ctx) || m) : (ctx.byRealIP.get(m) || m)))
  return out
}

/** Longest-real-value-first substring replace for every domain/name/github dictionary entry. */
function scrubDictionary(str, ctx) {
  if (typeof str !== 'string' || !ctx.dictionary.length) return str
  let out = str
  for (const { real, alias } of ctx.dictionary) {
    if (!out.toLowerCase().includes(real.toLowerCase())) continue
    const esc = real.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    out = out.replace(new RegExp(`(?<![a-z0-9])${esc}(?![a-z0-9])`, 'gi'), alias)
  }
  return out
}

function buildDictionary(ctx) {
  const list = []
  for (const [alias, e] of Object.entries(ctx.vault.entries)) {
    if (e.kind === 'domain' || e.kind === 'worker' || e.kind === 'kv' || e.kind === 'r2' || e.kind === 'd1' ||
        e.kind === 'queue' || e.kind === 'pages' || e.kind === 'ghowner' || e.kind === 'ghrepo') {
      if (e.real.length >= 5) list.push({ real: e.real, alias })
    }
  }
  list.sort((a, b) => b.real.length - a.real.length)
  return list
}

// ── structural minting: known high-value fields get pretty prefixes ────────
function mintStructural(raw, ctx) {
  if (raw.account?.id) mintId('account', raw.account.id, ctx)
  for (const m of raw.members || []) {
    if (m.id) mintId('member', m.id, ctx)
    if (m.email) mintEmail(m.email, ctx)
    if (m.user?.id) mintId('user', m.user.id, ctx)
    if (m.user?.email) mintEmail(m.user.email, ctx)
    for (const p of m.policies || []) if (p.id) mintId('policy', p.id, ctx)
    for (const r of m.roles || []) if (r.id) mintId('role', r.id, ctx)
  }
  for (const s of raw.subscriptions || []) {
    if (s.id) mintId('subscription', s.id, ctx)
    if (s.zone?.id) mintId('zone', s.zone.id, ctx)
    if (s.zone?.name) mintDomain(s.zone.name, ctx)
  }
  for (const t of raw.tokens || []) if (t.id) mintId('token', t.id, ctx)

  const r = raw.resources || {}
  for (const w of r.workers || []) { if (w.id) mintResourceName('worker', w.id, ctx); if (w.tag) mintId('worker', w.tag, ctx) }
  for (const k of r.kv || []) { if (k.id) mintId('kv', k.id, ctx); if (k.title) mintResourceName('kv', k.title, ctx) }
  for (const b of r.r2 || []) if (b.name) mintResourceName('r2', b.name, ctx)
  for (const d of r.d1 || []) { if (d.uuid) mintId('d1', d.uuid, ctx); if (d.name) mintResourceName('d1', d.name, ctx) }
  for (const q of r.queues || []) {
    if (q.queue_id) mintId('queue', q.queue_id, ctx)
    if (q.queue_name) mintResourceName('queue', q.queue_name, ctx)
    for (const c of q.consumers || []) if (c.consumer_id) mintId('queue', c.consumer_id, ctx)
  }
  for (const p of r.pages || []) {
    if (p.id) mintId('pages', p.id, ctx)
    if (p.project_id) mintId('pages', p.project_id, ctx)
    if (p.name) mintResourceName('pages', p.name, ctx)
    if (p.latest_deployment?.id) mintId('pages', p.latest_deployment.id, ctx)
    if (p.canonical_deployment?.id) mintId('pages', p.canonical_deployment.id, ctx)
    const owner = p.source?.config?.owner
    const repo = p.source?.config?.repo_name
    if (owner) mintGithub('ghowner', owner, ctx)
    if (repo) mintGithub('ghrepo', repo, ctx)
    if (p.source?.config?.owner_id != null) mintText('ghowner_id', String(p.source.config.owner_id), ctx, (hex, taken) => dedupeAlias('gh-owner-', hex, taken))
    if (p.source?.config?.repo_id != null) mintText('ghrepo_id', String(p.source.config.repo_id), ctx, (hex, taken) => dedupeAlias('gh-repo-', hex, taken))
    if (p.subdomain) mintResourceName('pages', p.subdomain.replace(/\.(pages|workers)\.dev$/i, ''), ctx)
    // Cloudflare's own *.pages.dev / *.workers.dev subdomains aren't sensitive —
    // only the project-name label is. Leave the suffix; the project's own
    // resource-name dictionary entry (from p.name above) catches the label via
    // the substring pass. Only genuine custom domains get the full domain alias.
    for (const d of p.domains || []) if (!/\.(pages|workers)\.dev$/i.test(d)) mintDomain(d, ctx)
  }

  for (const z of raw.zones || []) {
    if (z.id) mintId('zone', z.id, ctx)
    if (z.name) mintDomain(z.name, ctx)
    for (const rec of z.dnsRecords || []) if (rec.id) mintId('id', rec.id, ctx)
    for (const cp of z.certificatePacks || []) { if (cp.id) mintId('cert', cp.id, ctx); if (cp.primary_certificate) mintId('cert', cp.primary_certificate, ctx) }
    for (const rt of z.workersRoutes || []) if (rt.id) mintId('route', rt.id, ctx)
  }
}

function walkAndMint(node, path, ctx) {
  if (Array.isArray(node)) { for (const v of node) walkAndMint(v, path, ctx); return }
  if (node && typeof node === 'object') { for (const [k, v] of Object.entries(node)) walkAndMint(v, [...path, k], ctx); return }
  if (typeof node === 'string' && !isFreeTextPath(path)) scrubIdsAndPII(node, ctx)
}

function walkAndReplace(node, path) {
  if (Array.isArray(node)) return node.map((v) => walkAndReplace(v, path))
  if (node && typeof node === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(node)) out[k] = walkAndReplace(v, [...path, k])
    return out
  }
  if (typeof node !== 'string') return node
  if (isFreeTextPath(path)) return node.length ? '«redacted»' : node
  return node
}

function githubSourceAlias(node, path, ctx) {
  if (node == null || path.length < 3) return null
  const suffix = path.slice(-3).join('.')
  const kind = {
    'source.config.owner': 'ghowner',
    'source.config.owner_id': 'ghowner_id',
    'source.config.repo_name': 'ghrepo',
    'source.config.repo_id': 'ghrepo_id',
  }[suffix]
  if (!kind) return null
  return ctx.byRealText.get(`${kind}:${String(node).toLowerCase()}`) || null
}

/**
 * Full aliasing pass over a raw snapshot. Mutates the vault (mints new
 * entries as needed) and returns a new, fully-aliased snapshot object safe
 * to commit. `vault` is mutated in place; call saveVault(vault) after.
 */
export function aliasSnapshot(raw, vault) {
  ensureSalt()
  const idx = buildIndexes(vault)
  const ctx = { vault, mint: true, taken: new Set(Object.keys(vault.entries)), dirty: false, ...idx }

  // 1. mint from known high-value structural fields (pretty prefixes)
  mintStructural(raw, ctx)
  // 2. mint from a generic regex sweep for anything structural missed
  walkAndMint(raw, [], ctx)
  ctx.dictionary = buildDictionary(ctx)

  // 3. rewrite: free-text placeholders first, then id/email/ip regex swap,
  //    then the domain/name dictionary substring pass, applied per string leaf.
  function rewrite(node, path) {
    if (Array.isArray(node)) return node.map((v) => rewrite(v, path))
    if (node && typeof node === 'object') {
      const out = {}
      for (const [k, v] of Object.entries(node)) out[k] = rewrite(v, [...path, k])
      return out
    }
    const sourceAlias = githubSourceAlias(node, path, ctx)
    if (sourceAlias) return sourceAlias
    if (typeof node !== 'string') return node
    if (isFreeTextPath(path)) return node.length ? '«redacted»' : node
    return scrubDictionary(scrubIdsAndPII(node, ctx), ctx)
  }
  const aliased = rewrite(raw, [])
  return { aliased, dirty: ctx.dirty }
}

/**
 * Substitution-only scrub for anything else that might get committed
 * (config/*.json, dashboard build output). Never mints — only swaps values
 * already known to the vault, so it can never disagree with a snapshot's
 * aliasing of the same real value. Returns { scrubbed, unresolved } where
 * unresolved lists id/email-shaped strings found that AREN'T in the vault
 * yet (flag for manual review — see scripts/alias-existing.mjs).
 */
export function scrubText(value, vault) {
  const idx = buildIndexes(vault)
  const ctx = { vault, mint: false, taken: new Set(Object.keys(vault.entries)), dirty: false, ...idx }
  ctx.dictionary = buildDictionary(ctx)
  const unresolved = new Set()

  function checkUnresolved(str) {
    for (const re of [RE_HEX64, RE_HEX40, RE_UUID, RE_HEX32]) {
      for (const m of str.matchAll(re)) if (!ctx.byRealId.has(m[0].toLowerCase().replace(/-/g, ''))) unresolved.add(m[0])
    }
    for (const m of str.matchAll(RE_EMAIL)) if (!ctx.byRealText.has(`email:${m[0].toLowerCase()}`)) unresolved.add(m[0])
  }

  function rewrite(node) {
    if (Array.isArray(node)) return node.map(rewrite)
    if (node && typeof node === 'object') {
      const out = {}
      for (const [k, v] of Object.entries(node)) out[k] = rewrite(v)
      return out
    }
    if (typeof node !== 'string') return node
    if (node.length >= 6) checkUnresolved(node)
    return scrubDictionary(scrubIdsAndPII(node, ctx), ctx)
  }
  return { scrubbed: rewrite(value), unresolved: [...unresolved] }
}

/** Alias -> real lookup, for "work on this resource" workflows. */
export function realFor(alias, vault) {
  return vault.entries[alias]?.real ?? null
}

/** If `ref` is a known alias, return its real value; otherwise return `ref` unchanged
 *  (so callers can pass an alias, a real id, or a real name through the same argument). */
export function resolveAlias(ref, vault) {
  return vault.entries[ref]?.real ?? ref
}

/** Real value -> alias (reverse of realFor), for "what did this become" lookups. */
export function aliasFor(real, vault) {
  const needle = real.toLowerCase()
  for (const [alias, e] of Object.entries(vault.entries)) {
    if (e.real.toLowerCase() === needle) return alias
  }
  return null
}
