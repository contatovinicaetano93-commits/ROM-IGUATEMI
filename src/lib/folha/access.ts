import type { AuthRole } from '@/lib/auth'
import { hasPanelModule, parseGrantableModules } from '@/lib/intranet/modules'

/** Admin master, ops financeiro (Rodrigo) e RH — via módulo grantable `folha`. */
export function canAccessFolha(session: {
  role: string
  modules?: unknown
}): boolean {
  const role = session.role as AuthRole
  return hasPanelModule(role, parseGrantableModules(session.modules), 'folha')
}
