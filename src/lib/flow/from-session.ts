import type { AuthSession } from '@/lib/auth'
import type { User } from '@/lib/flow/types'
import { companiesForPanel } from '@/lib/intranet/companies'
import { getRomPanelId } from '@/lib/brand'
import { findEmployeeByEmail } from '@/lib/employees'
import { defaultAreas, defaultFlowRole } from '@/lib/flow/roles'

export { defaultAreas, defaultFlowRole } from '@/lib/flow/roles'

export function flowUserFromSession(
  session: AuthSession,
  overrides?: Partial<Pick<User, 'role' | 'companyIds' | 'areaIds' | 'id' | 'name' | 'email'>>,
): User {
  const panel = getRomPanelId()
  const companies = companiesForPanel(panel).map((c) => c.id)
  const role = overrides?.role ?? defaultFlowRole(session.role)
  return {
    id: overrides?.id ?? session.employeeId ?? `env:${session.role}:${session.user}`,
    name: overrides?.name ?? session.displayName ?? session.user,
    email: overrides?.email ?? session.user,
    role,
    status: 'active',
    companyIds: overrides?.companyIds ?? companies,
    areaIds: overrides?.areaIds ?? defaultAreas(session.role, role),
    created: new Date(0).toISOString(),
  }
}

export async function resolveFlowUser(session: AuthSession): Promise<User> {
  const fallback = flowUserFromSession(session)
  if (!session.employeeId && !session.user.includes('@')) return fallback
  try {
    const employee = await findEmployeeByEmail(session.user)
    if (!employee || employee.status !== 'active') return fallback
    return flowUserFromSession(session, {
      id: employee.id,
      name: employee.name,
      email: employee.email,
      role: employee.flow_role,
      companyIds: employee.companyIds.length ? employee.companyIds : fallback.companyIds,
      areaIds: employee.areaIds.length ? employee.areaIds : fallback.areaIds,
    })
  } catch {
    return fallback
  }
}

export function readerKey(session: AuthSession): string {
  return session.employeeId ?? `env:${session.role}:${session.user}`
}
