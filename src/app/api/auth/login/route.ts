import { NextRequest } from 'next/server'
import { ok, err } from '@/lib/api-response'
import {
  AUTH_COOKIE,
  createSessionToken,
  getAdminUser,
  isAuthEnabled,
  validateCredentials,
} from '@/lib/auth'
import { checkLoginRateLimit } from '@/lib/rate-limiter'
import { getPostHogClient } from '@/lib/posthog-server'

export async function POST(req: NextRequest) {
  if (!isAuthEnabled()) return ok({ auth: 'disabled', role: 'admin', can_view_revenue: true })

  const rate = checkLoginRateLimit(req.headers)
  if (!rate.ok) {
    const res = err('Muitas tentativas de login. Aguarde alguns minutos.', 429)
    for (const [k, v] of Object.entries(rate.responseHeaders)) res.headers.set(k, v)
    return res
  }

  const body = await req.json().catch(() => null)
  const username = typeof body?.username === 'string' ? body.username : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  const legacyToken = typeof body?.token === 'string' ? body.token : ''

  const user = username || getAdminUser()
  const pass = password || legacyToken
  const hit = pass ? validateCredentials(user, pass) : null

  if (!hit) {
    return err('Usuário ou senha incorretos', 401)
  }

  // Analytics não pode atrasar nem quebrar login: sem token vira no-op, erro é
  // engolido, e o flush não bloqueia a resposta (PostHog lento ≠ login lento).
  try {
    const posthog = getPostHogClient()
    if (posthog) {
      posthog.identify({
        distinctId: hit.user,
        properties: { role: hit.role },
      })
      posthog.capture({
        distinctId: hit.user,
        event: 'server_user_logged_in',
        properties: { role: hit.role },
      })
      void posthog.flush().catch(() => {})
    }
  } catch {
    // ignorado de propósito
  }

  const res = ok({
    auth: 'ok',
    user: hit.user,
    role: hit.role,
    can_view_revenue: hit.role === 'admin',
  })
  for (const [k, v] of Object.entries(rate.responseHeaders)) res.headers.set(k, v)
  res.cookies.set(AUTH_COOKIE, await createSessionToken(hit.user, hit.role), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  return res
}
