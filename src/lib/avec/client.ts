// Cliente HTTP da API de Relatórios Avec.
// Docs: https://documenter.getpostman.com/view/12527228/2sA2xmUWJo
// Base oficial (collection Postman): https://api.avec.beauty
// Auth: header Authorization = token puro (sem "Bearer").

import { getMockReport } from '@/lib/avec/fixtures'
import { isAvecLoginConfigured } from '@/lib/avec/refresh-token'
import { ensureFreshAvecApiToken } from '@/lib/avec/token-store'
import { getAvecUnitId } from '@/lib/brand'
import { todayIso } from '@/lib/salon/format'
import { isProduction } from '@/lib/env'
import { retryWithBackoff } from '@/lib/retry'

export const AVEC_DEFAULT_API_URL = 'https://api.avec.beauty'

export function isAvecMock() {
  const v = process.env.AVEC_MOCK
  return v === '1' || v === 'true'
}

/** Mock nunca em produção — evita sujar o Postgres real. */
export function assertAvecMockAllowed() {
  if (isAvecMock() && isProduction()) {
    throw new Error('AVEC_MOCK não permitido em produção — remova da Vercel')
  }
}

export interface AvecReportParams {
  page?: number
  limit?: number
  inicio?: string
  fim?: string
  site?: string
  profissional_id?: string
  [key: string]: string | number | undefined
}

/** Token puro — Avec rejeita "Bearer …" com 401; prefixo sobra em alguns envs. */
export function normalizeAvecApiToken(raw: string): string {
  return raw.trim().replace(/^Bearer\s+/i, '').trim()
}

/**
 * Headers no estilo do admin.avec.beauty.
 * Sem User-Agent/Origin o WAF da Avec às vezes devolve HTML 403 (não JSON 401).
 */
export function avecReportHeaders(token: string): Record<string, string> {
  return {
    Authorization: normalizeAvecApiToken(token),
    Accept: 'application/json',
    Origin: 'https://admin.avec.beauty',
    Referer: 'https://admin.avec.beauty/',
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
  }
}

/** 403 com corpo HTML = WAF/edge — vale retry; 403 JSON = permissão. */
export function isAvecWafForbiddenError(error: Error): boolean {
  const status = (error as Error & { status?: number }).status
  if (status !== 403) return false
  return /<html|403 Forbidden|cloudflare|just a moment/i.test(error.message)
}

/** Timeout/abort de página Avec — não vale retry (só queima o orçamento do cron). */
export function isAvecFetchAbortError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false
  const err = e as Error & { name?: string; message?: string }
  const name = err.name ?? ''
  const msg = err.message ?? String(e)
  return (
    name === 'AbortError' ||
    name === 'TimeoutError' ||
    /aborted|timeout|TimeoutError|AbortError/i.test(msg)
  )
}

async function getAvecConfig() {
  const baseUrl = getAvecBaseUrl()
  // Renova sozinho se o JWT (~12h) estiver perto do fim — não cai no env Vercel expirado.
  const token = normalizeAvecApiToken(await ensureFreshAvecApiToken({ minHoursLeft: 1 }))
  if (!token) {
    throw new Error('AVEC_API_TOKEN é obrigatório para sync com Avec')
  }
  return { baseUrl, token }
}

export function getAvecBaseUrl() {
  return (process.env.AVEC_API_URL ?? AVEC_DEFAULT_API_URL).replace(/\/$/, '')
}

export function isAvecConfigured() {
  return (
    Boolean(process.env.AVEC_API_TOKEN?.trim()) ||
    isAvecMock() ||
    isAvecLoginConfigured()
  )
}

export async function testAvecConnection() {
  if (!isAvecConfigured()) {
    return { ok: false as const, baseUrl: getAvecBaseUrl(), error: 'AVEC_API_TOKEN não configurado' }
  }
  if (isAvecMock()) {
    const payload = await fetchAvecReport('0004', { page: 1, limit: 1 })
    const rows = extractRows(payload)
    return { ok: true as const, baseUrl: getAvecBaseUrl(), sample_rows: rows.length, mock: true as const }
  }
  try {
    const payload = await fetchAvecReport('0004', { page: 1, limit: 1 })
    const rows = extractRows(payload)
    return { ok: true as const, baseUrl: getAvecBaseUrl(), sample_rows: rows.length }
  } catch (e) {
    return {
      ok: false as const,
      baseUrl: getAvecBaseUrl(),
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

// Formata datas no padrão dd/mm/yyyy usado pelos relatórios Avec.
export function fmtAvecDate(d: Date) {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

function fmtBrFromYmd(isoYmd: string) {
  const [y, m, d] = isoYmd.split('-')
  return `${d}/${m}/${y}`
}

function addCalendarDays(isoYmd: string, delta: number) {
  const [y, m, d] = isoYmd.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, m! - 1, d! + delta))
  return dt.toISOString().slice(0, 10)
}

function currentMonthRange() {
  const [year, month] = todayIso().split('-')
  const inicio = fmtBrFromYmd(`${year}-${month}-01`)
  return { inicio, fim: fmtBrFromYmd(todayIso()) }
}

function brDateToIso(value: string | undefined) {
  if (!value) return null
  const [day, month, year] = value.split('/').map(Number)
  if (!day || !month || !year) return null
  const dt = new Date(Date.UTC(year, month - 1, day))
  if (Number.isNaN(dt.getTime())) return null
  return dt.toISOString().slice(0, 10)
}

function returnRatePeriods(params: AvecReportParams) {
  const fallback = currentMonthRange()
  const inicio2 = params.inicio ?? fallback.inicio
  const fim2 = params.fim ?? fallback.fim
  const inicio2Iso = brDateToIso(inicio2)
  const inicio1 = inicio2Iso ? fmtBrFromYmd(addCalendarDays(inicio2Iso, -45)) : fallback.inicio

  return {
    inicio1: params.inicio1 ?? inicio1,
    fim1: params.fim1 ?? inicio2,
    inicio2: params.inicio2 ?? inicio2,
    fim2: params.fim2 ?? fim2,
  }
}

/**
 * Alguns relatórios da Avec exigem parâmetros mesmo para o estado "Todos".
 * Os valores abaixo vêm dos defaults/validações do próprio endpoint de Reports.
 */
export function withRequiredAvecReportParams(
  reportId: string,
  params: AvecReportParams = {},
): AvecReportParams {
  switch (reportId) {
    case '0149':
      return { ...params, local: params.local ?? '' }
    case '0021':
      return { ...params, tipo: params.tipo ?? 'todos' }
    case '0126':
      return { ...params, minutos: params.minutos ?? 60 }
    case '0107':
      return { ...params, dias: params.dias ?? 90 }
    case '0001': {
      const range = currentMonthRange()
      return { ...params, inicio: params.inicio ?? range.inicio, fim: params.fim ?? range.fim }
    }
    case '0002':
      // Relatório de atendidos — `como_conheceu` obrigatório ("" = todos).
      return { ...params, como_conheceu: params.como_conheceu ?? '' }
    case '0051': {
      // Em 0051, `site` = origem Online/Local (""|1|0), NÃO o AVEC_UNIT_ID.
      const site = params.site
      const origin = site === '' || site === '0' || site === '1' ? site : ''
      return { ...params, site: origin, profissional_id: params.profissional_id ?? '' }
    }
    case '0223':
      return { ...params, profissional_id: params.profissional_id ?? '' }
    case '0248': {
      // Status Agendamento: Faltou = 0.6 (descoberta via validation do endpoint).
      const range = currentMonthRange()
      return {
        ...params,
        inicio: params.inicio ?? range.inicio,
        fim: params.fim ?? range.fim,
        status: params.status ?? '0.6',
      }
    }
    case '0007': {
      const rest = { ...params }
      delete rest.inicio
      delete rest.fim
      return { ...returnRatePeriods(params), ...rest }
    }
    case '0011': {
      // Relatório de retorno exige salao_id (hidden) — sem isso a Avec devolve HTTP 400.
      const unit = getAvecUnitId()
      return {
        ...params,
        salao_id: params.salao_id ?? unit ?? undefined,
      }
    }
    default:
      return params
  }
}

/** Intervalo em datas de calendário America/Sao_Paulo (não UTC do servidor). */
export function periodRange(daysBack = 0, daysForward = 14) {
  const today = todayIso()
  return {
    inicio: fmtBrFromYmd(addCalendarDays(today, -daysBack)),
    fim: fmtBrFromYmd(addCalendarDays(today, daysForward)),
  }
}

/**
 * Janela Avec ~N dias terminando em `anchorYmd` (inclusive), no formato dd/mm/yyyy.
 * Usado no backfill histórico da Visão analítica (P2/P3 ancorados no fim do mês).
 */
export function periodRangeEndingOn(anchorYmd: string, daysBack = 30) {
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(anchorYmd) ? anchorYmd : todayIso()
  const back = Math.max(0, Math.floor(daysBack))
  return {
    inicio: fmtBrFromYmd(addCalendarDays(anchor, -back)),
    fim: fmtBrFromYmd(anchor),
  }
}

/**
 * Mês calendário em dd/mm/yyyy até `anchorYmd` (MTD se o âncora for o mês corrente).
 * Usado no P1 (ranking de profissionais 0021+0126) — alinha título Ago/2026 ao escopo real.
 */
export function calendarMonthRangeBr(anchorYmd: string) {
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(anchorYmd) ? anchorYmd : todayIso()
  const monthStart = `${anchor.slice(0, 7)}-01`
  return {
    inicio: fmtBrFromYmd(monthStart),
    fim: fmtBrFromYmd(anchor),
  }
}

// Extrai linhas do JSON de relatório — formato varia por endpoint.
// Formato oficial Avec Reports: { code, data: { report: { result: [...] } } }
export function extractRows(payload: unknown): Record<string, unknown>[] {
  if (!payload) return []
  if (Array.isArray(payload)) return payload as Record<string, unknown>[]
  if (typeof payload !== 'object') return []

  const obj = payload as Record<string, unknown>
  for (const key of ['data', 'rows', 'result', 'items', 'registros', 'lista']) {
    const val = obj[key]
    if (Array.isArray(val)) return val as Record<string, unknown>[]
  }

  // Alguns relatórios retornam { data: { rows: [...] } } ou { data: { report: { result: [...] } } }
  if (obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data)) {
    const nested = obj.data as Record<string, unknown>
    for (const key of ['rows', 'items', 'data', 'result', 'registros', 'lista']) {
      if (Array.isArray(nested[key])) return nested[key] as Record<string, unknown>[]
    }
    const report = nested.report
    if (report && typeof report === 'object' && !Array.isArray(report)) {
      const rep = report as Record<string, unknown>
      for (const key of ['result', 'rows', 'items', 'data', 'registros', 'lista']) {
        if (Array.isArray(rep[key])) return rep[key] as Record<string, unknown>[]
      }
    }
  }

  return []
}

/** Totais agregados do payload Avec (`total` / `report.total`) — usado no 0011 local. */
export function extractReportTotals(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== 'object') return []
  const obj = payload as Record<string, unknown>
  const dig = (node: unknown): Record<string, unknown>[] => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return []
    const n = node as Record<string, unknown>
    if (Array.isArray(n.total)) return n.total as Record<string, unknown>[]
    if (n.report && typeof n.report === 'object' && !Array.isArray(n.report)) {
      const rep = n.report as Record<string, unknown>
      if (Array.isArray(rep.total)) return rep.total as Record<string, unknown>[]
    }
    if (n.data) return dig(n.data)
    return []
  }
  return dig(obj)
}

export async function fetchAvecReport(
  reportId: string,
  params: AvecReportParams = {},
  opts?: { timeoutMs?: number },
) {
  assertAvecMockAllowed()
  const effectiveParams = withRequiredAvecReportParams(reportId, params)
  if (isAvecMock()) {
    return getMockReport(reportId, effectiveParams.page ?? 1)
  }

  const pageTimeoutMs = opts?.timeoutMs ?? 30_000
  const qs = new URLSearchParams()
  qs.set('page', String(effectiveParams.page ?? 1))
  qs.set('limit', String(effectiveParams.limit ?? 250))
  for (const [k, v] of Object.entries(effectiveParams)) {
    if (k === 'page' || k === 'limit' || v === undefined) continue
    qs.set(k, String(v))
  }

  const { baseUrl, token: initialToken } = await getAvecConfig()
  const url = `${baseUrl}/reports/${reportId}?${qs}`

  let token = initialToken
  let refreshedOnce = false

  return retryWithBackoff(
    async () => {
      const res = await fetch(url, {
        headers: avecReportHeaders(token),
        cache: 'no-store',
        signal: AbortSignal.timeout(pageTimeoutMs),
      })

      // JWT pode estar “válido” no relógio e ainda assim a Avec devolver 401 —
      // renova via login Cognito e tenta 1× de novo no mesmo request.
      if (res.status === 401 && !refreshedOnce && isAvecLoginConfigured()) {
        refreshedOnce = true
        await res.text().catch(() => '')
        token = normalizeAvecApiToken(
          await ensureFreshAvecApiToken({ force: true, minHoursLeft: 0 }),
        )
        const retry = await fetch(url, {
          headers: avecReportHeaders(token),
          cache: 'no-store',
          signal: AbortSignal.timeout(pageTimeoutMs),
        })
        if (retry.ok) return retry.json()
        const retryText = await retry.text().catch(() => '')
        const body =
          retry.status === 401
            ? 'token Avec expirado — renovar'
            : retryText
              ? retryText.slice(0, 200)
              : ''
        const err = new Error(`Avec ${reportId} HTTP ${retry.status}${body ? `: ${body}` : ''}`)
        ;(err as Error & { status?: number }).status = retry.status
        throw err
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        // 401: mensagem clara em PT (Admin/Hoje mapeiam via formatAvecUserMessage).
        const body =
          res.status === 401
            ? 'token Avec expirado — renovar'
            : text
              ? text.slice(0, 200)
              : ''
        const err = new Error(`Avec ${reportId} HTTP ${res.status}${body ? `: ${body}` : ''}`)
        ;(err as Error & { status?: number }).status = res.status
        throw err
      }

      return res.json()
    },
    {
      maxAttempts: 4,
      initialDelayMs: 1500,
      // Rede/5xx e WAF HTML 403 — retry. 4xx JSON (token/params) não.
      // Timeout/abort também não: 3×30s queima stock_fast / sync antes do deadline.
      shouldRetry: (e) => {
        if (isAvecFetchAbortError(e)) return false
        const status = (e as Error & { status?: number }).status
        if (status === undefined || status >= 500) return true
        return isAvecWafForbiddenError(e)
      },
    },
  )
}

// Pagina automaticamente até esgotar ou atingir maxPages.
export interface AvecReportFetchResult {
  rows: Record<string, unknown>[]
  truncated: boolean
  pagesFetched: number
  maxPages: number
  limit: number
  startPage: number
  endPage: number
  hasMore: boolean
  nextPage: number | null
}

export const AVEC_PAGE_LIMIT = 250
/** Padrão leve: 80 páginas × 250 = até 20.000 regs — evita estourar tempo/DB no full. */
export const AVEC_SYNC_MAX_PAGES_DEFAULT = 80

export function getAvecSyncMaxPages() {
  const raw = process.env.AVEC_SYNC_MAX_PAGES?.trim()
  if (!raw) return AVEC_SYNC_MAX_PAGES_DEFAULT
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 1) return AVEC_SYNC_MAX_PAGES_DEFAULT
  return Math.min(Math.floor(n), 500)
}

export const AVEC_REPORT_LABELS: Record<string, string> = {
  '0004': 'clientes',
  '0051': 'agendamentos',
  '0002': 'atendimentos',
  '0149': 'posição de estoque',
  '0046': 'alertas de estoque',
  '0044': 'movimentos de estoque',
  '0323': 'origem de compra',
}

export function wasPaginationTruncated(rowsOnLastPage: number, limit: number, page: number, maxPages: number) {
  return page >= maxPages && rowsOnLastPage >= limit
}

export function formatTruncationWarning(reportId: string, result: AvecReportFetchResult) {
  const label = AVEC_REPORT_LABELS[reportId] ?? reportId
  const range =
    result.endPage >= result.startPage
      ? ` (páginas ${result.startPage}–${result.endPage})`
      : ''
  const continueHint =
    result.hasMore && result.nextPage != null
      ? ` Use "Continuar sync" para buscar a partir da página ${result.nextPage}.`
      : ' Pode haver dados não sincronizados — use "Continuar sync" ou aumente AVEC_SYNC_MAX_PAGES na Vercel.'
  return `Relatório ${label} (${reportId}) atingiu o limite de ${result.maxPages} páginas neste lote${range} (${result.rows.length} linhas, ${result.limit}/página).${continueHint}`
}

export async function fetchAllAvecReport(
  reportId: string,
  params: AvecReportParams = {},
  maxPages = getAvecSyncMaxPages(),
  opts?: { deadlineAt?: number | null; startPage?: number },
): Promise<AvecReportFetchResult> {
  const limit = params.limit ?? AVEC_PAGE_LIMIT
  const startPage = opts?.startPage ?? 1
  const all: Record<string, unknown>[] = []
  let pagesFetched = 0
  let endPage = startPage - 1
  let truncated = false
  let hasMore = false
  const deadlineAt = opts?.deadlineAt ?? null

  for (let i = 0; i < maxPages; i++) {
    const page = startPage + i
    if (deadlineAt != null && Date.now() >= deadlineAt) {
      truncated = true
      break
    }
    let payload: unknown
    try {
      payload = await fetchAvecReport(reportId, { ...params, page, limit })
    } catch (e) {
      // Com deadline: abort limpo — devolve o que já veio em vez de matar o sync.
      if (deadlineAt != null && isAvecFetchAbortError(e)) {
        truncated = true
        break
      }
      throw e
    }
    const rows = extractRows(payload)
    if (rows.length === 0) break
    pagesFetched = i + 1
    endPage = page
    all.push(...rows)
    if (rows.length < limit) break
    if (wasPaginationTruncated(rows.length, limit, i + 1, maxPages)) {
      truncated = true
      hasMore = true
    }
  }

  const nextPage = hasMore ? endPage + 1 : null
  return {
    rows: all,
    truncated,
    pagesFetched,
    maxPages,
    limit,
    startPage,
    endPage,
    hasMore,
    nextPage,
  }
}
