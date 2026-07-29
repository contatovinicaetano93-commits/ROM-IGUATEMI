import type { NextRequest } from 'next/server'
import { isProduction } from '@/lib/env'

export const AUTH_COOKIE = 'rom_session'
const DEFAULT_ADMIN_USER = 'admin'

export type AuthRole = 'admin' | 'staff' | 'financeiro' | 'estoque'

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

export function getFinanceUser() {
  return (process.env.ROM_FINANCE_USER ?? '').trim()
}

export function getFinancePassword() {
  return (process.env.ROM_FINANCE_PASSWORD ?? '').trim()
}

export function getStockUser() {
  return (process.env.ROM_STOCK_USER ?? '').trim()
}

export function getStockPassword() {
  return (process.env.ROM_STOCK_PASSWORD ?? '').trim()
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
  const financeUser = getFinanceUser()
  const financePass = getFinancePassword()
  if (financeUser && financePass) {
    accounts.push({ user: financeUser, password: financePass, role: 'financeiro' })
  }
  const stockUser = getStockUser()
  const stockPass = getStockPassword()
  if (stockUser && stockPass) {
    accounts.push({ user: stockUser, password: stockPass, role: 'estoque' })
  }
  return accounts
}

export function isAuthEnabled() {
  return Boolean(getAdminPassword())
}

export function isStaffAuthConfigured() {
  return Boolean(getStaffUser() && getStaffPassword())
}

export function isFinanceAuthConfigured() {
  return Boolean(getFinanceUser() && getFinancePassword())
}

export function isStockAuthConfigured() {
  return Boolean(getStockUser() && getStockPassword())
}

export function canViewRevenue(role: AuthRole | null | undefined) {
  // Só admin vê faturamento no Hoje / Visão. Financeiro usa o painel /financeiro.
  return role === 'admin'
}

/** Segredo HMAC da sessão — NÃO usar a senha do usuário (permite rotação sem misturar com Bearer). */
export function getSessionSigningSecret() {
  const dedicated = process.env.ROM_SESSION_SECRET?.trim()
  if (dedicated) return dedicated
  // Fallback legado: senha admin (cookies antigos continuam válidos até relogin com secret dedicado).
  return getAdminPassword()
}

/** HMAC-SHA256 compatível com Edge Runtime (Web Crypto). */
/** Cache de tokens esperados por conta — evita N HMACs por request no middleware + handlers. */
const expectedTokenCache = new Map<string, { token: string; expiresAt: number }>()
const EXPECTED_TOKEN_TTL_MS = 5 * 60_000

/** Cache cookie → sessão (mesmo isolate serverless). */
const sessionByCookie = new Map<string, { session: AuthSession; expiresAt: number }>()
const SESSION_COOKIE_TTL_MS = 60_000

export async function createSessionToken(user: string, role: AuthRole) {
  const account = listAccounts().find((a) => a.role === role && timingSafeEqual(a.user, user))
  if (!account) return ''
  const secret = getSessionSigningSecret()
  if (!secret) return ''
  const cacheKey = `${role}:${user}:${secret.slice(0, 8)}`
  const hit = expectedTokenCache.get(cacheKey)
  if (hit && hit.expiresAt > Date.now()) return hit.token

  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`rom-session:${role}:${user}`))
  const token = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  expectedTokenCache.set(cacheKey, { token, expiresAt: Date.now() + EXPECTED_TOKEN_TTL_MS })
  return token
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

export async function getSession(req: NextRequest): Promise<AuthSession | null> {
  if (!isAuthEnabled()) {
    // Produção sem senha = fechado (nunca abrir o painel). Dev sem senha = aberto (conveniência local).
    if (isProduction()) return null
    return { user: getAdminUser(), role: 'admin', can_view_revenue: true }
  }

  const cookie = req.cookies.get(AUTH_COOKIE)?.value
  if (!cookie) return null

  const cached = sessionByCookie.get(cookie)
  if (cached && cached.expiresAt > Date.now()) return cached.session

  for (const account of listAccounts()) {
    const expected = await createSessionToken(account.user, account.role)
    if (expected && timingSafeEqual(cookie, expected)) {
      const session: AuthSession = {
        user: account.user,
        role: account.role,
        can_view_revenue: canViewRevenue(account.role),
      }
      sessionByCookie.set(cookie, { session, expiresAt: Date.now() + SESSION_COOKIE_TTL_MS })
      return session
    }
  }
  // Cookie antigo (pré dual-login) — invalida silenciosamente
  return null
}

export async function isAuthorized(req: NextRequest, { allowHeaderTokens = true }: AuthOptions = {}) {
  // Produção sem senha = fechado (nunca abrir o painel). Dev sem senha = aberto (conveniência local).
  if (!isAuthEnabled()) return !isProduction()

  if (await getSession(req)) return true

  if (!allowHeaderTokens) return false

  // Automação: só CRON_SECRET (nunca a senha de login).
  const auth = req.headers.get('authorization')
  const cron = process.env.CRON_SECRET?.trim()
  if (cron && (auth === `Bearer ${cron}` || req.headers.get('x-cron-secret') === cron)) return true

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

/** Factory para criar validadores de role. */
function createRoleValidator(
  allowedRoles: AuthRole[],
  restrictionMessage: string,
) {
  return async (req: NextRequest) => {
    const auth = await requireSession(req)
    if (!auth.ok) return auth
    if (!allowedRoles.includes(auth.session.role)) {
      return { ok: false as const, status: 403 as const, message: restrictionMessage }
    }
    return auth
  }
}

/** Relatórios financeiros / diretoria — só admin. */
export async function requireAdmin(req: NextRequest) {
  return createRoleValidator(['admin'], 'Acesso restrito ao admin operacional')(req)
}

/** Painel Financeiro (Sprint 4) — admin ou financeiro. Staff nunca acessa. */
export async function requireFinance(req: NextRequest) {
  return createRoleValidator(['admin', 'financeiro'], 'Acesso restrito ao financeiro')(req)
}

/** Painel Estoque — admin, financeiro (acesso duplo) ou estoque. Staff nunca acessa. */
export async function requireStock(req: NextRequest) {
  return createRoleValidator(['admin', 'financeiro', 'estoque'], 'Acesso restrito ao estoque')(req)
}
