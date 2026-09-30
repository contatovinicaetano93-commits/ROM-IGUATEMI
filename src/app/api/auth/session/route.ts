import { NextRequest } from 'next/server'
import { ok } from '@/lib/api-response'
import {
  AUTH_COOKIE,
  buildAuthSession,
  createV3SessionToken,
  getSession,
  isAuthEnabled,
  isStaffAuthConfigured,
} from '@/lib/auth'
import { isProduction } from '@/lib/env'
import { findEmployeeById } from '@/lib/employees'

export async function GET(req: NextRequest) {
  const enabled = isAuthEnabled()
  let session = enabled ? await getSession(req) : null
  if (session?.employeeId) {
    try {
      const employee = await findEmployeeById(session.employeeId)
      if (employee && employee.status === 'active') {
        const next = buildAuthSession(employee.email, employee.panel_role, {
          displayName: employee.name,
          employeeId: employee.id,
          canPublish: employee.can_publish || employee.panel_role === 'admin' || employee.panel_role === 'mkt',
          modules: employee.modules,
          professionalName: employee.professional_name,
        })
        const same =
          next.role === session.role &&
          next.modules.join(',') === session.modules.join(',') &&
          next.canPublish === session.canPublish &&
          next.professionalName === session.professionalName
        session = next
        const res = ok({
          auth_enabled: enabled,
          authenticated: true,
          user: session.user,
          role: session.role,
          can_view_revenue: session.can_view_revenue,
          displayName: session.displayName,
          employeeId: session.employeeId,
          canPublish: session.canPublish,
          modules: session.modules,
          professionalName: session.professionalName,
          staff_login_configured: isStaffAuthConfigured(),
        })
        if (!same) {
          res.cookies.set(AUTH_COOKIE, await createV3SessionToken(session), {
            httpOnly: true,
            sameSite: 'lax',
            secure: isProduction(),
            path: '/',
            maxAge: 60 * 60 * 24 * 30,
          })
        }
        return res
      }
    } catch {
      // intranet DB indisponível — segue o cookie
    }
  }
  return ok({
    auth_enabled: enabled,
    authenticated: enabled ? Boolean(session) : false,
    user: session?.user ?? null,
    role: session?.role ?? null,
    can_view_revenue: session?.can_view_revenue ?? false,
    displayName: session?.displayName ?? session?.user ?? null,
    employeeId: session?.employeeId ?? null,
    canPublish: session?.canPublish ?? false,
    modules: session?.modules ?? [],
    professionalName: session?.professionalName ?? null,
    staff_login_configured: isStaffAuthConfigured(),
  })
}
