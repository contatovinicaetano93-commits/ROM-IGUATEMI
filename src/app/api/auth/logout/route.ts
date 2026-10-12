import { ok } from '@/lib/api-response'
import { AUTH_COOKIE } from '@/lib/auth'
import { useSecureCookies } from '@/lib/env'

export async function POST() {
  const res = ok({ auth: 'logged_out' })
  res.cookies.set(AUTH_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: useSecureCookies(),
    path: '/',
    maxAge: 0,
  })
  return res
}
