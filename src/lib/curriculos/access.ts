import type { AuthRole } from '@/lib/auth'
import { hasPanelModule, parseGrantableModules } from '@/lib/intranet/modules'

export function canUseCurriculos(session: {
  role: string
  modules?: unknown
}): boolean {
  const role = session.role as AuthRole
  return hasPanelModule(role, parseGrantableModules(session.modules), 'curriculos')
}
