#!/usr/bin/env node
/**
 * PreToolUse tripwire for CF Command Center.
 * Fires on two matchers (see .codex/hooks.json): Bash, and
 * mcp__cloudflare__execute (Cloudflare's own "Code Mode" MCP server, which
 * runs agent-written JavaScript against the live API instead of exposing
 * fixed named tools - so there's no per-call read/write distinction to hook
 * into upstream of this).
 *
 * Layered defense (this is layer 3 of 3):
 *   1. Codex hook trust        → the user reviews this hook before it runs.
 *   2. scripts/lib/guard.mjs   → action scripts refuse without CF_EDIT_TOKEN
 *                                 and CF_ALLOW_DESTRUCTIVE=YES_I_AM_SURE.
 *   3. THIS hook               → blocks catastrophic *ad-hoc* commands/code
 *                                 (curl/wrangler/Invoke-RestMethod DELETEs,
 *                                 a mcp__cloudflare__execute call that looks
 *                                 like a live DELETE/destructive write,
 *                                 recursive removal of saved state or
 *                                 secrets) that try to bypass the
 *                                 sanctioned, audited action path.
 *
 * Fail-open by design (never bricks routine work) EXCEPT for the catastrophic
 * patterns below, where it fails-closed. Exit 2 = block, exit 0 = allow.
 *
 * To disable it, use Codex's /hooks command or remove the PreToolUse hooks
 * from .codex/hooks.json.
 */
import { readFileSync, appendFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

const ALLOW = 0
const BLOCK = 2

function read() {
  try { return JSON.parse(readFileSync(0, 'utf8') || '{}') } catch { return {} }
}

const data = read()
const toolName = String(data?.tool_name ?? '')
const isExecuteTool = toolName === 'mcp__cloudflare__execute'

// Bash carries its command as tool_input.command. The Code Mode "execute"
// tool has no fixed input schema documented (it just takes agent-written
// JS) - serialize the whole tool_input so the pattern checks below work
// regardless of the exact field name Cloudflare's server uses for it.
const cmd = isExecuteTool
  ? JSON.stringify(data?.tool_input ?? {})
  : String(data?.tool_input?.command ?? '')
if (!cmd.trim() || cmd === '{}') process.exit(ALLOW)

const isGuardedAction = /scripts[\\/]+actions[\\/]+/.test(cmd)
const isArmed = /CF_ALLOW_DESTRUCTIVE\s*[=:]\s*["']?YES_I_AM_SURE/.test(cmd)
const touchesCloudflare =
  isExecuteTool || /api\.cloudflare\.com/i.test(cmd) || /\bwrangler\b/i.test(cmd) || isGuardedAction

// ── Catastrophic patterns. These bypass the audited action path. ────────────
const httpDelete = /(curl[^\n]*-X\s*DELETE|Invoke-RestMethod[^\n]*-Method\s*Delete|--request\s*DELETE|method\s*[:=]\s*\\?['"]DELETE|request\s*\(\s*\\?['"]DELETE|\.delete\s*\(|\/delete\b|\bpurge_cache\b)/i
const cfApiDelete = (/api\.cloudflare\.com/i.test(cmd) || isExecuteTool) && httpDelete.test(cmd)
const wranglerDelete = /\bwrangler\b[^\n]*\b(delete|remove)\b/i.test(cmd)

// Saved state + secrets are sacred — protect from recursive deletion ALWAYS.
// secrets/ holds the alias-map.json vault (2026-07-08) — the only local copy
// of every alias->real mapping; config/ holds the real (gitignored) backlog +
// token-capability data. Both are as unrecoverable as snapshots/.env if wiped.
const recursiveRm = /(rm\s+-[a-z]*r|Remove-Item[^\n]*-Recurse|rmdir\s+\/s|rd\s+\/s)/i.test(cmd)
const hitsProtected = /(snapshots|reports|reference|secrets|config|\.git\b|\.env)/i.test(cmd)
const nukesSavedState = recursiveRm && hitsProtected

const log = (verdict, why) => {
  if (!touchesCloudflare && !recursiveRm) return
  try {
    const file = join(process.cwd(), 'reports', 'guard-audit.log')
    mkdirSync(dirname(file), { recursive: true })
    appendFileSync(
      file,
      JSON.stringify({ ts: new Date().toISOString(), verdict, why, tool: toolName || 'Bash', cmd }) + '\n'
    )
  } catch { /* never let logging break the hook */ }
}

if (nukesSavedState) {
  log('BLOCK', 'recursive-delete-of-protected-path')
  console.error(
    '⛔ BLOCKED: refusing to recursively delete saved state / secrets ' +
    '(snapshots/ reports/ reference/ secrets/ config/ .git .env).\n' +
    'These are the whole point of this repo. If you really mean it, do it ' +
    'manually outside Claude.'
  )
  process.exit(BLOCK)
}

if ((cfApiDelete || wranglerDelete) && !(isGuardedAction && isArmed)) {
  log('BLOCK', cfApiDelete ? 'adhoc-cf-api-delete' : 'adhoc-wrangler-delete')
  console.error(
    '⛔ BLOCKED: ' + (isExecuteTool
      ? 'mcp__cloudflare__execute call looks like a live DELETE/destructive write.'
      : 'ad-hoc destructive Cloudflare command outside the audited path.') + '\n' +
    'Destructive changes must go through a guarded action script:\n' +
    '  CF_EDIT_TOKEN=...  CF_ALLOW_DESTRUCTIVE=YES_I_AM_SURE  node scripts/actions/<name>.mjs\n' +
    'See docs/SAFETY.md (break-glass protocol).'
  )
  process.exit(BLOCK)
}

if (touchesCloudflare) log('ALLOW', isGuardedAction ? 'guarded-action' : (isExecuteTool ? 'cf-execute' : 'cf-touch'))
process.exit(ALLOW)
