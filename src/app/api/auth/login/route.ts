import { NextRequest } from 'next/server'
import { ok, err } from '@/lib/api-response'
import {
  AUTH_COOKIE,
  createSessionToken,
  getAdminUser,
  isAuthEnabled,
  validateCredentials,
} from '@/lib/auth'
import { LoginRequestSchema } from '@/lib/schemas'

export async function POST(req: NextRequest) {
  if (!isAuthEnabled()) return ok({ auth: 'disabled', role: 'admin', can_view_revenue: true })

  const body = await req.json().catch(() => null)

  const validation = LoginRequestSchema.safeParse(body)
  if (!validation.success) {
    return err(validation.error.issues[0]?.message || 'Dados inválidos', 400)
  }

  const { user: username, password } = validation.data
  const legacyToken = typeof body?.token === 'string' ? body.token : ''

  const user = username || getAdminUser()
  const pass = password || legacyToken
  const hit = pass ? validateCredentials(user, pass) : null

  if (!hit) {
    return err('Usuário ou senha incorretos', 401)
  }

  const res = ok({
    auth: 'ok',
    user: hit.user,
    role: hit.role,
    can_view_revenue: hit.role === 'admin',
  })
  res.cookies.set(AUTH_COOKIE, await createSessionToken(hit.user, hit.role), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  return res
}
