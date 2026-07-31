import { getSql } from '@/lib/db'
import {
  hoursLeftInAvecToken,
  isAvecLoginConfigured,
  mintAvecApiToken,
} from '@/lib/avec/refresh-token'

const TOKEN_KEY = 'avec_api_token'

/** Evita N mint Cognito em paralelo no mesmo isolate (várias queries 401). */
let refreshInFlight: Promise<string> | null = null

/** Token fresco em memória — evita hit no Postgres a cada getAvecConfig. */
let memToken: { token: string; expiresAtMs: number } | null = null
const MEM_TOKEN_TTL_MS = 60_000

export async function ensureTokenStore(): Promise<void> {
  const sql = getSql()
  const exists = (await sql`
    select to_regclass('public.app_runtime_secrets') is not null as ok
  `) as { ok: boolean }[]
  if (exists[0]?.ok) return

  await sql`
    create table if not exists app_runtime_secrets (
      key text primary key,
      value text not null,
      expires_at timestamptz,
      updated_at timestamptz not null default now()
    )
  `
}

function decodeJwtExp(token: string): number | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const pad = '='.repeat((4 - (payload.length % 4)) % 4)
    const json = JSON.parse(Buffer.from(payload + pad, 'base64url').toString('utf8')) as {
      exp?: number
    }
    return typeof json.exp === 'number' ? json.exp : null
  } catch {
    return null
  }
}

export function hoursLeftInToken(token: string): number {
  const exp = decodeJwtExp(token)
  if (exp == null) return -1
  return (exp - Date.now() / 1000) / 3600
}

/** Persiste JWT Avec no Postgres — sync lê daqui sem precisar redeploy. */
export async function saveAvecApiToken(token: string): Promise<void> {
  await ensureTokenStore()
  const sql = getSql()
  const exp = decodeJwtExp(token)
  const expiresAt = exp != null ? new Date(exp * 1000).toISOString() : null
  await sql`
    insert into app_runtime_secrets (key, value, expires_at, updated_at)
    values (${TOKEN_KEY}, ${token}, ${expiresAt}::timestamptz, now())
    on conflict (key) do update set
      value = excluded.value,
      expires_at = excluded.expires_at,
      updated_at = now()
  `
}

/**
 * Token runtime (Postgres) se ainda válido (>30 min); senão null.
 * Env AVEC_API_TOKEN continua como fallback em getAvecApiToken().
 */
export async function loadRuntimeAvecApiToken(): Promise<string | null> {
  try {
    await ensureTokenStore()
    const sql = getSql()
    const rows = (await sql`
      select value, expires_at
      from app_runtime_secrets
      where key = ${TOKEN_KEY}
      limit 1
    `) as { value: string; expires_at: string | null }[]
    const row = rows[0]
    if (!row?.value) return null
    const left = hoursLeftInToken(row.value)
    if (left < 0.5) return null
    return row.value
  } catch {
    return null
  }
}

/**
 * Garante JWT Avec válido para sync.
 * - Se runtime/env ainda tem ≥ minHoursLeft → usa.
 * - Senão, se login configurado → mint Cognito + grava no Postgres.
 * - Nunca cai num env expirado sem tentar renovar (era a causa do 401 em Estoque/Hoje).
 */
export async function ensureFreshAvecApiToken(opts?: {
  force?: boolean
  /** Horas mínimas restantes para reutilizar o token atual. Default 1. */
  minHoursLeft?: number
}): Promise<string> {
  const minHours = opts?.minHoursLeft ?? 1
  const force = opts?.force === true

  if (!force && memToken && memToken.expiresAtMs > Date.now()) {
    const left = hoursLeftInAvecToken(memToken.token)
    if (left >= minHours) return memToken.token
  }

  const runtime = await loadRuntimeAvecApiToken()
  const envTok = process.env.AVEC_API_TOKEN?.trim() || null
  const candidates = [runtime, envTok].filter((t): t is string => Boolean(t))

  if (!force) {
    let best: { token: string; hours_left: number } | null = null
    for (const t of candidates) {
      const left = hoursLeftInAvecToken(t)
      if (left >= minHours && (!best || left > best.hours_left)) {
        best = { token: t, hours_left: left }
      }
    }
    if (best) {
      memToken = { token: best.token, expiresAtMs: Date.now() + MEM_TOKEN_TTL_MS }
      return best.token
    }
  }

  if (!isAvecLoginConfigured()) {
    for (const t of candidates) {
      if (hoursLeftInAvecToken(t) > 0) return t
    }
    throw new Error(
      'Token Avec ausente/expirado — configure AVEC_LOGIN_EMAIL/PASSWORD/UNIT_ID ou AVEC_API_TOKEN',
    )
  }

  if (refreshInFlight) return refreshInFlight

  refreshInFlight = (async () => {
    const minted = await mintAvecApiToken({
      force: true,
      currentToken: runtime ?? envTok,
      minHoursLeft: 0,
    })
    await saveAvecApiToken(minted.token)
    memToken = { token: minted.token, expiresAtMs: Date.now() + MEM_TOKEN_TTL_MS }
    return minted.token
  })()

  try {
    return await refreshInFlight
  } finally {
    refreshInFlight = null
  }
}
