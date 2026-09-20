import { AUDIT_LABEL } from '@/lib/flow/format'
import type { AuditAction } from '@/lib/flow/types'

/** Flow logs `action.toUpperCase()` (APPROVE, DOCS…) as well as canonical AUDIT_LABEL keys. */
const FLOW_ACTION_ALIAS: Record<string, AuditAction> = {
  CREATE: 'CREATE_EXPENSE',
  CREATE_EXPENSE: 'CREATE_EXPENSE',
  DOCS: 'REQUEST_DOCUMENTATION',
  REQUEST_DOCUMENTATION: 'REQUEST_DOCUMENTATION',
  APPROVE: 'APPROVE_EXPENSE',
  APPROVE_EXPENSE: 'APPROVE_EXPENSE',
  REJECT: 'REJECT_EXPENSE',
  REJECT_EXPENSE: 'REJECT_EXPENSE',
  RESUBMIT: 'UPDATE_EXPENSE',
  UPDATE_EXPENSE: 'UPDATE_EXPENSE',
  DELETE_EXPENSE: 'DELETE_EXPENSE',
  CREATE_USER: 'CREATE_USER',
  UPDATE_USER: 'UPDATE_USER',
  REVOKE_USER: 'REVOKE_USER',
  ATTACH_PROOF: 'ATTACH_PROOF',
  PROGRESS: 'PROGRESS_EXPENSE',
  PROGRESS_EXPENSE: 'PROGRESS_EXPENSE',
  COMPLETE: 'COMPLETE_EXPENSE',
  COMPLETE_EXPENSE: 'COMPLETE_EXPENSE',
  CANCEL: 'CANCEL_EXPENSE',
  CANCEL_EXPENSE: 'CANCEL_EXPENSE',
}

export function intranetAuditLabel(action: string, resource: string): string {
  if (resource.startsWith('cms:')) return 'Publicou na intranet'
  if (action === 'PUBLISH') return 'Publicou na intranet'
  const canonical = FLOW_ACTION_ALIAS[action.toUpperCase()]
  if (canonical) return AUDIT_LABEL[canonical]
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
