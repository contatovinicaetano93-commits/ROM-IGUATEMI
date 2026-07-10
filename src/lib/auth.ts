import type { NextRequest } from 'next/server'
import { isProduction } from '@/lib/env'

export const AUTH_COOKIE = 'rom_session'
const DEFAULT_ADMIN_USER = 'admin'

export type AuthRole = 'admin' | 'staff'

export interface AuthSession {
  user: string
  role: AuthRole
  can_view_revenue: boolean
}

interface AuthOptions {
  allowHeaderTokens?: boolean
}

interface Account {
  user: string
  password: string
  role: AuthRole
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}

function normalizeUsername(value: string) {
  return value.trim()
}

function usernamesMatch(a: string, b: string) {
  return timingSafeEqual(a.toLowerCase(), b.toLowerCase())
}

export function getAdminUser() {
  return (process.env.ROM_ADMIN_USER ?? DEFAULT_ADMIN_USER).trim()
}

export function getAdminPassword() {
  return (process.env.ROM_ADMIN_PASSWORD ?? process.env.ROM_ACCESS_TOKEN ?? '').trim()
}

export function getStaffUser() {
  return (process.env.ROM_STAFF_USER ?? '').trim()
}

export function getStaffPassword() {
  return (process.env.ROM_STAFF_PASSWORD ?? '').trim()
}

function listAccounts(): Account[] {
  const accounts: Account[] = []
  const adminPass = getAdminPassword()
  if (adminPass) {
    accounts.push({ user: getAdminUser(), password: adminPass, role: 'admin' })
  }
  const staffUser = getStaffUser()
  const staffPass = getStaffPassword()
  if (staffUser && staffPass) {
    accounts.push({ user: staffUser, password: staffPass, role: 'staff' })
  }
  return accounts
}

export function isAuthEnabled() {
  return Boolean(getAdminPassword())
}

export function isStaffAuthConfigured() {
  return Boolean(getStaffUser() && getStaffPassword())
}

export function canViewRevenue(role: AuthRole | null | undefined) {
  return role === 'admin'
}

/** HMAC-SHA256 compatível com Edge Runtime (Web Crypto). */
export async function createSessionToken(user: string, role: AuthRole) {
  const account = listAccounts().find((a) => a.role === role && timingSafeEqual(a.user, user))
  if (!account) return ''
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(account.password),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`rom-session:${role}:${user}`))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function validateCredentials(
  username: string,
  password: string
): { user: string; role: AuthRole } | null {
  const user = normalizeUsername(username)
  const pass = password.trim()
  if (!user || !pass) return null
  for (const account of listAccounts()) {
    if (usernamesMatch(user, account.user) && timingSafeEqual(pass, account.password)) {
      return { user: account.user, role: account.role }
    }
  }
  return null
}

/** @deprecated use validateCredentials — mantido para callers antigos */
export function validateAdminCredentials(username: string, password: string) {
  const hit = validateCredentials(username, password)
  return hit?.role === 'admin'
}

export async function getSession(req: NextRequest): Promise<AuthSession | null> {
  if (!isAuthEnabled()) {
    // Produção sem senha = fechado (nunca abrir o painel). Dev sem senha = aberto (conveniência local).
    if (isProduction()) return null
    return { user: getAdminUser(), role: 'admin', can_view_revenue: true }
  }

  const cookie = req.cookies.get(AUTH_COOKIE)?.value
  if (cookie) {
    for (const account of listAccounts()) {
      const expected = await createSessionToken(account.user, account.role)
      if (expected && timingSafeEqual(cookie, expected)) {
        return {
          user: account.user,
          role: account.role,
          can_view_revenue: canViewRevenue(account.role),
        }
      }
    }
    // Cookie antigo (pré dual-login) — invalida silenciosamente
  }

  return null
}

export async function isAuthorized(req: NextRequest, { allowHeaderTokens = true }: AuthOptions = {}) {
  // Produção sem senha = fechado (nunca abrir o painel). Dev sem senha = aberto (conveniência local).
  if (!isAuthEnabled()) return !isProduction()

  if (await getSession(req)) return true

  if (!allowHeaderTokens) return false

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

export async function requireSession(req: NextRequest) {
  if (!isAuthEnabled() && !isProduction()) {
    return {
      ok: true as const,
      session: { user: getAdminUser(), role: 'admin' as const, can_view_revenue: true },
    }
  }
  const session = await getSession(req)
  if (!session) {
    return { ok: false as const, status: 401 as const, message: 'Não autorizado' }
  }
  return { ok: true as const, session }
}

/** Relatórios financeiros / diretoria — só admin. */
export async function requireAdmin(req: NextRequest) {
  const auth = await requireSession(req)
  if (!auth.ok) return auth
  if (auth.session.role !== 'admin') {
    return { ok: false as const, status: 403 as const, message: 'Acesso restrito ao admin operacional' }
  }
  return auth
}
