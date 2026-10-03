import { AUDIT_LABEL } from '@/lib/flow/format'
import type { AuditAction } from '@/lib/flow/types'

const FLOW_ACTIONS = new Set<string>(Object.keys(AUDIT_LABEL))

/** Verbs persisted by applyExpenseAction (`action.toUpperCase()`) → AUDIT_LABEL keys. */
const FLOW_ACTION_ALIAS: Record<string, AuditAction> = {
  CREATE: 'CREATE_EXPENSE',
  DOCS: 'REQUEST_DOCUMENTATION',
  APPROVE: 'APPROVE_EXPENSE',
  REJECT: 'REJECT_EXPENSE',
  RESUBMIT: 'UPDATE_EXPENSE',
  PROGRESS: 'PROGRESS_EXPENSE',
  COMPLETE: 'COMPLETE_EXPENSE',
  CANCEL: 'CANCEL_EXPENSE',
}

export function intranetAuditLabel(action: string, resource: string): string {
  if (resource.startsWith('cms:')) return 'Publicou na intranet'
  if (action === 'PUBLISH') return 'Publicou na intranet'
  const key = action.toUpperCase()
  const mapped = FLOW_ACTION_ALIAS[key] ?? (FLOW_ACTIONS.has(key) ? (key as AuditAction) : null)
  if (mapped) return AUDIT_LABEL[mapped]
  return action
}

export function intranetAuditHref(resource: string): string | null {
  if (resource.startsWith('flow:user:') || resource.startsWith('intranet:')) return '/pessoas'
  if (resource.startsWith('flow:') && resource !== 'flow:') {
    const id = resource.slice('flow:'.length)
    if (id && !id.startsWith('user:')) return `/flow/${id}`
  }
  if (resource.startsWith('cms:')) return '/empresa'
  return null
}
