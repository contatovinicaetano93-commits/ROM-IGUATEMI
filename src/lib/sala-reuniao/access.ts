import type { AuthSession } from '@/lib/auth'
import { hasPanelModule, parseGrantableModules } from '@/lib/intranet/modules'
import { isProfessionalStaff } from '@/lib/intranet/professional-nav'

/** Qualquer papel com o módulo, exceto profissional (staff + professional_name). */
export function canUseSalaReuniao(session: Pick<AuthSession, 'role' | 'modules' | 'professionalName'>): boolean {
  if (isProfessionalStaff(session.role, session.professionalName)) return false
  return hasPanelModule(session.role, parseGrantableModules(session.modules), 'sala_reuniao')
}

export function canCancelSalaReuniao(
  session: Pick<AuthSession, 'role' | 'employeeId' | 'modules' | 'professionalName'>,
  reservation: { created_by_employee_id: string | null },
): boolean {
  if (!canUseSalaReuniao(session)) return false
  if (session.role === 'admin') return true
  const mine = session.employeeId && reservation.created_by_employee_id === session.employeeId
  return Boolean(mine)
}
