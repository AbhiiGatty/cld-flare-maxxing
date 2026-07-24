// Break-glass guard for destructive/mutating actions (defense layer 2 of 3).
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { DIRS } from './paths.mjs'
import { ensureDir, log } from './util.mjs'

const AUDIT_LOG = join(DIRS.reports, 'actions-audit.log')

/** Append one line to the local action audit trail. */
export function audit(entry, { required = false } = {}) {
  try {
    ensureDir(DIRS.reports)
    appendFileSync(AUDIT_LOG, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n')
    return true
  } catch (e) {
    if (required) throw new Error(`could not write required action audit record: ${e.message}`, { cause: e })
    log.warn('could not write audit log:', e.message)
    return false
  }
}

/**
 * Throw unless the operator has explicitly armed break-glass:
 *   - CF_EDIT_TOKEN present (a real edit-capable token), AND
 *   - CF_ALLOW_DESTRUCTIVE === 'YES_I_AM_SURE'
 * Every attempt — allowed or refused — is written to the audit trail.
 */
export function assertBreakGlass(action, details = {}) {
  const armed = process.env.CF_ALLOW_DESTRUCTIVE === 'YES_I_AM_SURE'
  const hasEdit = !!process.env.CF_EDIT_TOKEN
  if (!armed || !hasEdit) {
    audit({ action, status: 'REFUSED', reason: !hasEdit ? 'missing CF_EDIT_TOKEN' : 'not armed (CF_ALLOW_DESTRUCTIVE)', details })
    throw new Error(
      `\n⛔ Refusing destructive action "${action}".\n` +
      `   Break-glass protocol required:\n` +
      `     1. Put your EDIT token in ${DIRS.breakGlassEnv}  (CF_EDIT_TOKEN=...)\n` +
      `     2. Set CF_ALLOW_DESTRUCTIVE=YES_I_AM_SURE\n` +
      `     3. Re-run the action script.\n`
    )
  }
  audit({ action, status: 'ARMED', details }, { required: true })
}

/** Print an unmissable banner before a mutation runs. */
export function breakGlassBanner(action) {
  log.warn('═══════════════════════════════════════════════════════════════')
  log.warn(`  BREAK-GLASS ARMED — about to MUTATE Cloudflare: ${action}`)
  log.warn('  This is a real change to your live account.')
  log.warn('═══════════════════════════════════════════════════════════════')
}
