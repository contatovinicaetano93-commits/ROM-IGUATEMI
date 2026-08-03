/**
 * Mensagens legíveis (PT) para falhas de sync Avec — Admin, Hoje, Estoque.
 * Mapeia HTTP 401 / JSON cru → "token expirado / renovar".
 */

export const AVEC_TOKEN_EXPIRED_MESSAGE =
  'Token Avec expirado — o refresh automático (a cada 3h) falhou; force em Admin ou /api/avec/refresh-token?force=1'

/** Último sync bem-sucedido há mais que isto → badge "stale" (paridade Cérebro fast / 1h). */
export const AVEC_SYNC_STALE_MS = 1 * 60 * 60 * 1000

export type AvecSyncUiStatus = 'ok' | 'partial' | 'error' | 'stale' | 'never' | 'off'

export type AvecSyncUiTone = 'success' | 'gold' | 'danger'

export interface AvecSyncLastLike {
  status: string
  created_at: string
  error?: string | null
  stats?: {
    warnings?: unknown
    errors?: unknown
    aborted?: unknown
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

  // WAF/edge devolve HTML 403 (não JSON) — comum em egress serverless.
  if (/\bHTTP\s*403\b/i.test(raw) && /<html|403 Forbidden/i.test(raw)) {
    const report = raw.match(/Avec\s+(\d{4})/i)?.[1]
    const prefix = report ? `Avec ${report}` : 'Avec'
    return `${prefix} bloqueado pelo WAF (403) — retry automático; se persistir, rode sync fora da Vercel ou aguarde`
  }

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

/** Erros periféricos (P1 0107 timeout) que não devem sozinhos marcar sync partial. */
export function isSoftAvecPeripheralError(error: string): boolean {
  return /P1 0107:.*(timeout|abort)/i.test(error)
}

/**
 * Avisos informativos que NÃO devem sozinhos marcar o sync como partial.
 * Truncamento / unit id ausente ainda aparecem em stats.warnings na UI.
 */

export function isSoftAvecSyncWarning(warning: string): boolean {
  // Truncamento de páginas: soft SÓ para catálogo/saldo/alertas/TM.
  // Core (0002/0051/caixa/0248/…) incompleto → HARD (sync partial).
  if (/atingiu o limite de \d+ páginas/i.test(warning)) {
    return /\((0223|0004|0046|0149)\)/.test(warning)
  }
  if (/P1 0107 truncado/i.test(warning)) return true
  if (/P1 0107:\s*timeout\/abort/i.test(warning)) return true
  if (/AVEC_UNIT_ID vazio/i.test(warning)) return true
  // Reconcile de agenda: informativo (órfãos limpos), sync pode ficar ok.
  if (/agenda:\s*\d+\s*agendamento/i.test(warning)) return true
  if (/agenda:\s*reconcile de órfãos adiado/i.test(warning)) return true
  if (/sync:\s*orçamento esgotado/i.test(warning)) return true
  // Consequência do abort limpo por orçamento — core (receita/caixa) já veio.
  if (/agenda:.*orçamento/i.test(warning)) return true
  if (/agenda:\s*reconcile\/KPI adiado/i.test(warning)) return true
  // TM 0223 catálogo / ignorado de propósito — não marca sync partial.
  if (/TM 0223:/i.test(warning)) return true
  // Truncamento que PULA métricas (recorrentes/agenda reconcile) é HARD.
  // Catálogo 0004 adiado de propósito (ritmo leve).
  if (/Catálogo 0004 adiado/i.test(warning)) return true
  // P3 sem taxa explícita — informativo.
  if (/sem retorno|retorno local indisponível/i.test(warning)) return true
  // Estoque: paginação parcial limpa por orçamento.
  if (/fetch parcial/i.test(warning)) return true
  // Heal importado best-effort — não marca sync partial.
  if (/heal importado:/i.test(warning)) return true
  // Snapshot archival falhou — não é KPI core (paridade BR).
  if (/^snapshot\s/i.test(warning)) return true
  // Webhook scope=kpi — agenda fica para o cron; não marca sync partial.
  if (/fast\/kpi:/i.test(warning)) return true
  return false
}

export function hardAvecSyncWarnings(warnings: string[]): string[] {
  return warnings.filter((w) => !isSoftAvecSyncWarning(w))
}

/**
 * Full abandonado só por P1 0107 (reativação 90d) — core já sincronizou.
 * UI não deve pintar todos os KPIs como "incompleto".
 */
export function isSoftOnlyPartialAvecRun(last: AvecSyncLastLike | null | undefined): boolean {
  if (!last || last.status !== 'partial') return false
  const errors = asStringArray(last.stats?.errors)
  const hardW = hardAvecSyncWarnings(asStringArray(last.stats?.warnings))
  if (hardW.length > 0 || errors.length === 0) return false
  return errors.every(isSoftAvecPeripheralError)
}

/**
 * Abort limpo por orçamento com core já gravado e só warnings soft.
 * Não deve acender banner “sync parcial” na Visão (BR costuma abortar agenda).
 */
export function isCleanBudgetAbortPartial(last: AvecSyncLastLike | null | undefined): boolean {
  if (!last || last.status !== 'partial') return false
  const errors = asStringArray(last.stats?.errors)
  if (errors.length > 0) return false
  const warnings = asStringArray(last.stats?.warnings)
  if (hardAvecSyncWarnings(warnings).length > 0) return false
  const aborted = Boolean(last.stats?.aborted)
  const budgetWarn = warnings.some((w) => /orçamento esgotado/i.test(w))
  return aborted || budgetWarn
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
 * stale = último sync com sucesso há mais de 1h (caixa do dia / fast).
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

  const softOnlyPartial = isSoftOnlyPartialAvecRun(last)
  const cleanBudgetAbort = isCleanBudgetAbortPartial(last)
  const calmPartial = softOnlyPartial || cleanBudgetAbort
  const softErrors = softOnlyPartial ? asStringArray(last.stats?.errors) : []
  const uiWarnings = softErrors.length > 0 ? [...warnings, ...softErrors] : warnings

  if (last.status === 'partial' && !calmPartial) {
    return {
      status: 'partial',
      label: `Sync parcial ${ageLabel}`,
      tone: 'gold',
      detail: uiWarnings[0] ?? detail,
      warnings: uiWarnings,
    }
  }

  if (ageMs > staleAfterMs) {
    return {
      status: 'stale',
      label: `Sync atrasado ${ageLabel}`,
      tone: 'gold',
      detail: softOnlyPartial
        ? 'Full falhou só em relatório periférico (0107); fast/core ok — rode sync fast'
        : cleanBudgetAbort
          ? 'Último full abortou no orçamento com core ok — rode sync fast se Hoje estiver velho'
          : 'Último sync bem-sucedido há mais de 2–3h',
      warnings: uiWarnings,
    }
  }

  return {
    status: 'ok',
    label: `Sync ok ${ageLabel}`,
    tone: 'success',
    detail: uiWarnings[0] ?? null,
    warnings: uiWarnings,
  }
}
