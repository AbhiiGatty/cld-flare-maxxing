#!/usr/bin/env node
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const ALLOW = 0
const BLOCK = 2

function input() {
  try {
    return JSON.parse(readFileSync(0, 'utf8') || '{}')
  } catch {
    return {}
  }
}

const data = input()
const toolName = String(data?.tool_name || '')
const isCodeMode = toolName === 'mcp__cloudflare__execute'
const command = isCodeMode
  ? JSON.stringify(data?.tool_input || {})
  : String(data?.tool_input?.command || '')

if (!command.trim() || command === '{}') process.exit(ALLOW)

const recursiveDelete = /(rm\s+-[a-z]*r|Remove-Item[^\n]*-Recurse|rmdir\s+\/s|rd\s+\/s)/i.test(command)
const deletesScopedState = recursiveDelete
  && /(?:^|[\s"'`\\/])\.cloudflare-maxxing(?:[\s"'`\\/]|$)/i.test(command)
const destructiveHttp = /(DELETE|purge_cache|\/purge_cache)\b/i.test(command)
const cloudflareApiDelete = /api\.cloudflare\.com/i.test(command) && destructiveHttp
const codeModeWrite = isCodeMode && /\b(POST|PUT|PATCH|DELETE|purge_cache)\b/i.test(command)
const wranglerDelete = /\bwrangler\b[^\n]*\b(delete|remove)\b/i.test(command)

function audit(verdict, reason) {
  try {
    const project = process.env.CLAUDE_PROJECT_DIR || process.cwd()
    const file = join(project, '.cloudflare-maxxing', 'reports', 'guard-audit.log')
    mkdirSync(dirname(file), { recursive: true })
    appendFileSync(file, JSON.stringify({
      ts: new Date().toISOString(),
      verdict,
      reason,
      tool: toolName || 'Bash',
      command,
    }) + '\n')
  } catch {
    // The deterministic action guard still fails closed before any mutation.
  }
}

if (deletesScopedState) {
  audit('BLOCK', 'recursive-delete-of-cloudflare-maxxing-state')
  console.error('Blocked recursive deletion of .cloudflare-maxxing state. Remove it manually outside Claude if intentional.')
  process.exit(BLOCK)
}

if (cloudflareApiDelete || codeModeWrite || wranglerDelete) {
  audit('BLOCK', 'ad-hoc-cloudflare-mutation')
  console.error('Blocked an ad-hoc destructive Cloudflare call. Use the Cloudflare Maxxing guarded action dry-run and break-glass flow.')
  process.exit(BLOCK)
}

process.exit(ALLOW)
