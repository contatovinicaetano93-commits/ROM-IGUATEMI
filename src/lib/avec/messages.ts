/**
 * Mensagens legíveis (PT) para falhas de sync Avec — Admin, Hoje, Estoque.
 * Mapeia HTTP 401 / JSON cru → "token expirado / renovar".
 */

export const AVEC_TOKEN_EXPIRED_MESSAGE =
  'Token Avec expirado — renovar (scripts/refresh-avec-token.mjs ou Admin → Sync Avec)'

/** Último sync bem-sucedido há mais que isto → badge "stale". */
export const AVEC_SYNC_STALE_MS = 2.5 * 60 * 60 * 1000

export type AvecSyncUiStatus = 'ok' | 'partial' | 'error' | 'stale' | 'never' | 'off'

export type AvecSyncUiTone = 'success' | 'gold' | 'danger'

export interface AvecSyncLastLike {
  status: string
  created_at: string
  error?: string | null
  stats?: {
    warnings?: unknown
    errors?: unknown
  } | null
}

export interface AvecSyncUi {
  status: AvecSyncUiStatus
  label: string
  tone: AvecSyncUiTone
  detail: string | null
  warnings: string[]
}

export function isAvecTokenExpiredError(raw: string | null | undefined): boolean {
  if (!raw) return false
  if (/token Avec expirado/i.test(raw)) return true
  if (/\bHTTP\s*401\b/i.test(raw)) return true
  // JSON cru comum da API: {"message":"Unauthorized"} junto de Avec
  if (/Avec/i.test(raw) && /unauthorized|não autorizado|nao autorizado/i.test(raw)) return true
  return false
}

/** Converte erro técnico (HTTP/JSON) em cópia para a UI. */
export function formatAvecUserMessage(raw: string | null | undefined): string | null {
  if (!raw) return null
  if (isAvecTokenExpiredError(raw)) return AVEC_TOKEN_EXPIRED_MESSAGE

  // HTTP 403 com corpo JSON — manter contexto, sem despejar JSON longo
  const http = raw.match(/\bHTTP\s*(\d+)\b/i)
  if (http && raw.includes('{')) {
    const status = http[1]
    const report = raw.match(/Avec\s+(\d{4})/i)?.[1]
    const prefix = report ? `Avec ${report} HTTP ${status}` : `Avec HTTP ${status}`
    if (status === '401') return AVEC_TOKEN_EXPIRED_MESSAGE
    return `${prefix} — falha na API (verifique token e parâmetros)`
  }

  return raw
}

export function formatAvecErrorList(errors: string[]): string[] {
  return errors.map((e) => formatAvecUserMessage(e) ?? e)
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
}

export function extractSyncWarnings(last: AvecSyncLastLike | null | undefined): string[] {
  if (!last?.stats) return []
  return asStringArray(last.stats.warnings)
}

function timeAgoShort(iso: string, now: number): string {
  const diffMs = now - new Date(iso).getTime()
  const min = Math.round(diffMs / 60_000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `há ${h}h`
  return `há ${Math.round(h / 24)}d`
}

/**
 * Estado compacto do sync para badge (Hoje / Admin / Estoque).
 * stale = último sync com sucesso há mais de ~2,5h.
 */
export function deriveAvecSyncUi(opts: {
  configured: boolean
  last: AvecSyncLastLike | null | undefined
  now?: number
  staleAfterMs?: number
}): AvecSyncUi {
  const now = opts.now ?? Date.now()
  const staleAfterMs = opts.staleAfterMs ?? AVEC_SYNC_STALE_MS
  const warnings = extractSyncWarnings(opts.last ?? null)

  if (!opts.configured) {
    return {
      status: 'off',
      label: 'Avec off',
      tone: 'gold',
      detail: 'AVEC_API_TOKEN não configurado',
      warnings,
    }
  }

  const last = opts.last
  if (!last) {
    return {
      status: 'never',
      label: 'Sync nunca rodou',
      tone: 'danger',
      detail: null,
      warnings,
    }
  }

  const ageLabel = timeAgoShort(last.created_at, now)
  const detail = formatAvecUserMessage(last.error) ?? last.error ?? null
  const ageMs = now - new Date(last.created_at).getTime()

  if (last.status === 'error') {
    const tokenDead = isAvecTokenExpiredError(last.error)
    return {
      status: 'error',
      label: tokenDead ? 'Token Avec expirado' : `Sync falhou ${ageLabel}`,
      tone: 'danger',
      detail: detail ?? 'Erro na sincronização Avec',
      warnings,
    }
  }

  if (last.status === 'partial') {
    return {
      status: 'partial',
      label: `Sync parcial ${ageLabel}`,
      tone: 'gold',
      detail: warnings[0] ?? detail,
      warnings,
    }
  }

  if (ageMs > staleAfterMs) {
    return {
      status: 'stale',
      label: `Sync atrasado ${ageLabel}`,
      tone: 'gold',
      detail: 'Último sync bem-sucedido há mais de 2–3h',
      warnings,
    }
  }

  return {
    status: 'ok',
    label: `Sync ok ${ageLabel}`,
    tone: 'success',
    detail: warnings[0] ?? null,
    warnings,
  }
}
