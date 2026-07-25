import { getSql } from '@/lib/db'

const TOKEN_KEY = 'avec_api_token'

export async function ensureTokenStore(): Promise<void> {
  const sql = getSql()
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

/** Persiste JWT Avec no Neon — sync lê daqui sem precisar redeploy. */
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
 * Token runtime (Neon) se ainda válido (>30 min); senão null.
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
