import type { NextRequest } from 'next/server'
import { secretsEqual } from '@/lib/cron-auth'
import { isProduction } from '@/lib/env'
import type { GrantableModuleKey } from '@/lib/intranet/modules'
import { hasPanelModule, parseGrantableModules } from '@/lib/intranet/modules'

export const AUTH_COOKIE = 'rom_session'
const DEFAULT_ADMIN_USER = 'admin'

export type AuthRole = 'admin' | 'staff' | 'financeiro' | 'estoque' | 'mkt'

export interface AuthSession {
  user: string
  role: AuthRole
  can_view_revenue: boolean
  displayName: string
  employeeId: string | null
  canPublish: boolean
  modules: GrantableModuleKey[]
}

export function canPublishContent(session: AuthSession | null | undefined) {
  if (!session) return false
  return session.canPublish || session.role === 'admin' || session.role === 'mkt'
}

function sessionFromRole(user: string, role: AuthRole, extra?: Partial<AuthSession>): AuthSession {
  return {
    user,
    role,
    can_view_revenue: canViewRevenue(role),
    displayName: extra?.displayName ?? user,
    employeeId: extra?.employeeId ?? null,
    canPublish: extra?.canPublish ?? (role === 'admin' || role === 'mkt'),
    modules: parseGrantableModules(extra?.modules ?? []),
  }
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

/** Validade da sessão — alinhada ao maxAge do cookie no login. */
export const SESSION_TTL_MS = 60 * 60 * 24 * 30 * 1000

/** Cache de tokens esperados por conta — evita N HMACs por request no middleware + handlers. */
const expectedTokenCache = new Map<string, { token: string; expiresAt: number }>()
const EXPECTED_TOKEN_TTL_MS = 5 * 60_000
const EXPECTED_TOKEN_CACHE_MAX = 500

/** Cache cookie → sessão (mesmo isolate serverless). */
const sessionByCookie = new Map<string, { session: AuthSession; expiresAt: number }>()
const SESSION_COOKIE_TTL_MS = 60_000

/** HMAC-SHA256 compatível com Edge Runtime (Web Crypto). */
async function hmacHex(secret: string, payload: string) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Token `v2.<expiraEmMs>.<hmac>` — a assinatura cobre a expiração, então adulterar
 * o `exp` invalida o token. Sem `expiresAtMs` emite sessão nova (login);
 * com `expiresAtMs` recalcula o esperado para verificar um cookie existente.
 */
export async function createSessionToken(user: string, role: AuthRole, expiresAtMs?: number) {
  const account = listAccounts().find((a) => a.role === role && timingSafeEqual(a.user, user))
  if (!account) return ''
  const secret = getSessionSigningSecret()
  if (!secret) return ''
  const exp = expiresAtMs ?? Date.now() + SESSION_TTL_MS
  const cacheKey = `${role}:${user}:${secret.slice(0, 8)}:${exp}`
  const hit = expectedTokenCache.get(cacheKey)
  if (hit && hit.expiresAt > Date.now()) return hit.token

  const sig = await hmacHex(secret, `rom-session:${role}:${user}:${exp}`)
  const token = `v2.${exp}.${sig}`
  // Cada login gera um exp novo — limpa antes de crescer sem limite.
  if (expectedTokenCache.size >= EXPECTED_TOKEN_CACHE_MAX) expectedTokenCache.clear()
  expectedTokenCache.set(cacheKey, { token, expiresAt: Date.now() + EXPECTED_TOKEN_TTL_MS })
  return token
}

/** Lê o `exp` de um token v2. Token legado, malformado ou vencido → null. */
function parseSessionToken(token: string): { exp: number } | null {
  const [version, expRaw, sig] = token.split('.')
  if (version !== 'v2' || !expRaw || !sig) return null
  const exp = Number(expRaw)
  if (!Number.isSafeInteger(exp) || exp <= Date.now()) return null
  return { exp }
}

type V3Claims = {
  u: string
  r: AuthRole
  n: string
  e: string | null
  p: boolean
  m?: GrantableModuleKey[]
}

function utf8ToB64Url(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let bin = ''
  for (const byte of bytes) bin += String.fromCharCode(byte)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64UrlToUtf8(value: string): string | null {
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4)
    const bin = atob(padded)
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}

function parseAuthRole(value: unknown): AuthRole | null {
  if (
    value === 'admin' ||
    value === 'staff' ||
    value === 'financeiro' ||
    value === 'estoque' ||
    value === 'mkt'
  ) {
    return value
  }
  return null
}

export function buildAuthSession(
  user: string,
  role: AuthRole,
  extra?: Partial<Pick<AuthSession, 'displayName' | 'employeeId' | 'canPublish' | 'modules'>>,
): AuthSession {
  return sessionFromRole(user, role, extra)
}

/** Token `v3.<exp>.<claimsB64>.<hmac>` — sessão de colaborador (tabela) ou env com nome. */
export async function createV3SessionToken(session: AuthSession, expiresAtMs?: number) {
  const secret = getSessionSigningSecret()
  if (!secret) return ''
  const exp = expiresAtMs ?? Date.now() + SESSION_TTL_MS
  const claims: V3Claims = {
    u: session.user,
    r: session.role,
    n: session.displayName,
    e: session.employeeId,
    p: session.canPublish,
    m: session.modules,
  }
  const payload = utf8ToB64Url(JSON.stringify(claims))
  const sig = await hmacHex(secret, `rom-session-v3:${exp}:${payload}`)
  return `v3.${exp}.${payload}.${sig}`
}

async function parseV3SessionToken(
  token: string,
): Promise<{ session: AuthSession; exp: number } | null> {
  const [version, expRaw, payload, sig] = token.split('.')
  if (version !== 'v3' || !expRaw || !payload || !sig) return null
  const exp = Number(expRaw)
  if (!Number.isSafeInteger(exp) || exp <= Date.now()) return null
  const secret = getSessionSigningSecret()
  if (!secret) return null
  const expected = await hmacHex(secret, `rom-session-v3:${exp}:${payload}`)
  if (!timingSafeEqual(sig, expected)) return null
  const raw = b64UrlToUtf8(payload)
  if (!raw) return null
  try {
    const claims = JSON.parse(raw) as V3Claims
    const role = parseAuthRole(claims.r)
    if (!role || typeof claims.u !== 'string' || !claims.u) return null
    return {
      exp,
      session: sessionFromRole(claims.u, role, {
        displayName: typeof claims.n === 'string' && claims.n ? claims.n : claims.u,
        employeeId: typeof claims.e === 'string' && claims.e ? claims.e : null,
        canPublish: Boolean(claims.p) || role === 'admin' || role === 'mkt',
        modules: parseGrantableModules(claims.m),
      }),
    }
  } catch {
    return null
  }
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
    return sessionFromRole(getAdminUser(), 'admin', { displayName: getAdminUser(), canPublish: true })
  }

  const cookie = req.cookies.get(AUTH_COOKIE)?.value
  if (!cookie) return null

  const cached = sessionByCookie.get(cookie)
  if (cached && cached.expiresAt > Date.now()) return cached.session

  // Expiração vem do próprio token; adulterar o exp invalida a assinatura.
  const v3 = await parseV3SessionToken(cookie)
  if (v3) {
    const cacheUntil = Math.min(Date.now() + SESSION_COOKIE_TTL_MS, v3.exp)
    sessionByCookie.set(cookie, { session: v3.session, expiresAt: cacheUntil })
    return v3.session
  }

  const parsed = parseSessionToken(cookie)
  if (!parsed) return null

  for (const account of listAccounts()) {
    const expected = await createSessionToken(account.user, account.role, parsed.exp)
    if (expected && timingSafeEqual(cookie, expected)) {
      const session = sessionFromRole(account.user, account.role)
      // O cache nunca pode estender a validade do token.
      const cacheUntil = Math.min(Date.now() + SESSION_COOKIE_TTL_MS, parsed.exp)
      sessionByCookie.set(cookie, { session, expiresAt: cacheUntil })
      return session
    }
  }
  // Cookie antigo (pré v2) ou de outra conta — invalida silenciosamente
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
  if (cron) {
    if (auth?.startsWith('Bearer ') && secretsEqual(auth.slice('Bearer '.length), cron)) return true
    const header = req.headers.get('x-cron-secret')
    if (header && secretsEqual(header, cron)) return true
  }

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
      session: sessionFromRole(getAdminUser(), 'admin', { canPublish: true }),
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

function requireModule(
  req: NextRequest,
  key: GrantableModuleKey,
  restrictionMessage: string,
) {
  return (async () => {
    const auth = await requireSession(req)
    if (!auth.ok) return auth
    if (!hasPanelModule(auth.session.role, auth.session.modules, key)) {
      return { ok: false as const, status: 403 as const, message: restrictionMessage }
    }
    return auth
  })()
}

/** Painel Financeiro — papel financeiro/admin ou extra do colaborador. */
export async function requireFinance(req: NextRequest) {
  return requireModule(req, 'financeiro', 'Acesso restrito ao financeiro')
}

/** Overview de Relatórios — pacote financeiro ou extra relatorios. */
export async function requireRelatorios(req: NextRequest) {
  return requireModule(req, 'relatorios', 'Acesso restrito aos relatórios')
}

/** Painel Estoque — papel estoque/financeiro/admin ou extra. */
export async function requireStock(req: NextRequest) {
  return requireModule(req, 'estoque', 'Acesso restrito ao estoque')
}

/** Visão analítica / KPIs — admin ou extra Rom Adm. */
export async function requireDashboard(req: NextRequest) {
  return requireModule(req, 'dashboard', 'Acesso restrito à visão analítica')
}

/** Publicação de notícias/eventos/banners — admin ou marketing. */
export async function requirePublisher(req: NextRequest) {
  const auth = await requireSession(req)
  if (!auth.ok) return auth
  if (!canPublishContent(auth.session)) {
    return { ok: false as const, status: 403 as const, message: 'Acesso restrito à publicação da intranet' }
  }
  return auth
}
