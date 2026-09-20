import { NextRequest } from 'next/server'
import { ok, err } from '@/lib/api-response'
import {
  AUTH_COOKIE,
  buildAuthSession,
  createV3SessionToken,
  getAdminUser,
  isAuthEnabled,
  validateCredentials,
  type AuthSession,
} from '@/lib/auth'
import { isProduction } from '@/lib/env'
import { checkLoginRateLimit } from '@/lib/rate-limiter'
import { getPostHogClient } from '@/lib/posthog-server'
import { findEmployeeByEmail } from '@/lib/employees'
import { verifyPassword } from '@/lib/intranet/password'

export async function POST(req: NextRequest) {
  if (!isAuthEnabled()) return ok({ auth: 'disabled', role: 'admin', can_view_revenue: true })

  const rate = checkLoginRateLimit(req.headers)
  if (!rate.ok) {
    const res = err('Muitas tentativas de login. Aguarde alguns minutos.', 429)
    for (const [k, v] of Object.entries(rate.responseHeaders)) res.headers.set(k, v)
    return res
  }

  const body = await req.json().catch(() => null)
  const parsedUser =
    typeof body?.user === 'string' ? body.user : typeof body?.username === 'string' ? body.username : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  const legacyToken = typeof body?.token === 'string' ? body.token : ''

  const user = parsedUser || getAdminUser()
  const pass = password || legacyToken || ''
  let session: AuthSession | null = null

  if (pass) {
    try {
      const employee = await findEmployeeByEmail(user)
      if (employee && employee.status === 'active') {
        const okPass = await verifyPassword(pass, employee.password_hash)
        if (okPass) {
          session = buildAuthSession(employee.email, employee.panel_role, {
            displayName: employee.name,
            employeeId: employee.id,
            canPublish: employee.can_publish || employee.panel_role === 'admin' || employee.panel_role === 'mkt',
            modules: employee.modules,
          })
        }
      }
    } catch {
      session = null
    }
  }

  if (!session) {
    const hit = pass ? validateCredentials(user, pass) : null
    if (!hit) {
      return err('Usuário ou senha incorretos', 401)
    }
    session = buildAuthSession(hit.user, hit.role)
  }

  // Analytics não pode atrasar nem quebrar login: sem token vira no-op, erro é
  // engolido, e o flush não bloqueia a resposta (PostHog lento ≠ login lento).
  try {
    const posthog = getPostHogClient()
    if (posthog) {
      posthog.identify({
        distinctId: session.user,
        properties: { role: session.role },
      })
      posthog.capture({
        distinctId: session.user,
        event: 'server_user_logged_in',
        properties: { role: session.role },
      })
      void posthog.flush().catch(() => {})
    }
  } catch {
    // ignorado de propósito
  }

  const res = ok({
    auth: 'ok',
    user: session.user,
    role: session.role,
    can_view_revenue: session.can_view_revenue,
    displayName: session.displayName,
    employeeId: session.employeeId,
    canPublish: session.canPublish,
    modules: session.modules,
  })
  for (const [k, v] of Object.entries(rate.responseHeaders)) res.headers.set(k, v)
  res.cookies.set(AUTH_COOKIE, await createV3SessionToken(session), {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction(),
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  return res
}
