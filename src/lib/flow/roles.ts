import type { AuthRole } from '@/lib/auth'
import type { FlowRole, RequestArea } from '@/lib/flow/types'
import { REQUEST_AREAS } from '@/lib/flow/workflow'

export function defaultFlowRole(panelRole: AuthRole): FlowRole {
  switch (panelRole) {
    case 'admin':
      return 'master'
    case 'financeiro':
      return 'admin_financeiro'
    case 'estoque':
      return 'solicitante'
    case 'staff':
      return 'solicitante'
    case 'mkt':
      return 'solicitante'
    default: {
      const _exhaustive: never = panelRole
      return _exhaustive
    }
  }
}

export function defaultAreas(panelRole: AuthRole, flowRole: FlowRole): RequestArea[] {
  if (flowRole === 'master') return [...REQUEST_AREAS]
  if (flowRole === 'admin_financeiro') return ['financeiro']
  if (flowRole === 'admin_manutencao') return ['manutencao']
  if (flowRole === 'admin_compras') return ['compras']
  if (flowRole === 'admin_rh') return ['rh']
  if (panelRole === 'estoque') return ['manutencao']
  return [...REQUEST_AREAS]
}
