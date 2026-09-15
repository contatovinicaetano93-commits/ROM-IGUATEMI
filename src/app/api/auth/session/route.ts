import { NextRequest } from 'next/server'
import { ok } from '@/lib/api-response'
import { getSession, isAuthEnabled, isStaffAuthConfigured } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const enabled = isAuthEnabled()
  const session = enabled ? await getSession(req) : null
  return ok({
    auth_enabled: enabled,
    authenticated: enabled ? Boolean(session) : false,
    user: session?.user ?? null,
    role: session?.role ?? null,
    can_view_revenue: session?.can_view_revenue ?? false,
    displayName: session?.displayName ?? session?.user ?? null,
    employeeId: session?.employeeId ?? null,
    canPublish: session?.canPublish ?? false,
    staff_login_configured: isStaffAuthConfigured(),
  })
}
