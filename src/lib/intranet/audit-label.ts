import { AUDIT_LABEL } from '@/lib/flow/format'
import type { AuditAction } from '@/lib/flow/types'

const FLOW_ACTIONS = new Set<string>(Object.keys(AUDIT_LABEL))

export function intranetAuditLabel(action: string, resource: string): string {
  if (resource.startsWith('cms:')) return 'Publicou na intranet'
  if (action === 'PUBLISH') return 'Publicou na intranet'
  if (FLOW_ACTIONS.has(action)) return AUDIT_LABEL[action as AuditAction]
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
