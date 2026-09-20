import type { AuthRole } from '@/lib/auth'
import type { FlowRole, RequestArea } from '@/lib/flow/types'
import { REQUEST_AREAS } from '@/lib/flow/workflow'

export type IntranetNotification = {
  id: string
  title: string
  body: string
  href: string | null
  created_at: string
}

export function flowAudienceKey(area: RequestArea): string {
  return `flow:${area}`
}

export function notificationAudienceKeys(input: {
  readerKey: string
  panelRole: AuthRole
  flowRole: FlowRole
  areaIds: readonly RequestArea[]
}): string[] {
  const keys = new Set<string>([input.readerKey])
  if (input.panelRole === 'admin' || input.flowRole === 'master') {
    keys.add('role:admin')
    for (const area of REQUEST_AREAS) keys.add(flowAudienceKey(area))
    return [...keys]
  }
  switch (input.flowRole) {
    case 'admin_financeiro':
    case 'admin_manutencao':
    case 'admin_compras':
    case 'admin_rh':
      for (const area of input.areaIds) keys.add(flowAudienceKey(area))
      return [...keys]
    case 'solicitante':
      return [...keys]
    default: {
      const _never: never = input.flowRole
      return _never
    }
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isNotificationId(id: string): boolean {
  return UUID_RE.test(id)
}
