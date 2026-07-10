import type { NextRequest } from 'next/server'
import { isProduction } from '@/lib/env'

export const AUTH_COOKIE = 'rom_session'
const DEFAULT_ADMIN_USER = 'ADMIN-IGUATEMI'

/** Comparação em tempo constante (Edge-safe). */
export function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}

export function getAdminUser() {
  return (process.env.ROM_ADMIN_USER ?? DEFAULT_ADMIN_USER).trim()
}

export function getAdminPassword() {
  return (process.env.ROM_ADMIN_PASSWORD ?? process.env.ROM_ACCESS_TOKEN ?? '').trim()
}

export function isAuthEnabled() {
  return Boolean(getAdminPassword())
}

/** HMAC-SHA256 compatível com Edge Runtime (Web Crypto). */
export async function createSessionToken() {
  const password = getAdminPassword()
  const user = getAdminUser()
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`rom-session:${user}`))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function validateAdminCredentials(username: string, password: string) {
  const expectedUser = getAdminUser()
  const expectedPass = getAdminPassword()
  if (!expectedPass) return false
  return timingSafeEqual(username.trim(), expectedUser) && timingSafeEqual(password, expectedPass)
}

export async function isAuthorized(req: NextRequest) {
  // Produção sem senha = fechado (nunca abrir o painel).
  if (!isAuthEnabled()) return !isProduction()

  const session = req.cookies.get(AUTH_COOKIE)?.value
  if (session) {
    const expected = await createSessionToken()
    if (timingSafeEqual(session, expected)) return true
  }

  const auth = req.headers.get('authorization')
  const cron = process.env.CRON_SECRET
  if (cron && (auth === `Bearer ${cron}` || req.headers.get('x-cron-secret') === cron)) return true

  const legacyToken = getAdminPassword()
  if (legacyToken && auth === `Bearer ${legacyToken}`) return true

  return false
}

export async function requireAuth(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return { ok: false as const, status: 401 as const, message: 'Não autorizado' }
  }
  return { ok: true as const }
}
