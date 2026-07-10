// Cliente HTTP da API de Relatórios Avec.
// Docs: https://documenter.getpostman.com/view/12527228/2sA2xmUWJo
// Base oficial (collection Postman): https://api.avec.beauty
// Auth: header Authorization = token puro (sem "Bearer").

import { getMockReport } from '@/lib/avec/fixtures'
import { todayIso } from '@/lib/salon/format'
import { isProduction } from '@/lib/env'

export const AVEC_DEFAULT_API_URL = 'https://api.avec.beauty'

export function isAvecMock() {
  const v = process.env.AVEC_MOCK
  return v === '1' || v === 'true'
}

/** Mock nunca em produção — evita sujar o Neon real. */
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

function getConfig() {
  const baseUrl = getAvecBaseUrl()
  const token = process.env.AVEC_API_TOKEN
  if (!token) {
    throw new Error('AVEC_API_TOKEN é obrigatório para sync com Avec')
  }
  return { baseUrl, token }
}

export function getAvecBaseUrl() {
  return (process.env.AVEC_API_URL ?? AVEC_DEFAULT_API_URL).replace(/\/$/, '')
}

export function isAvecConfigured() {
  return Boolean(process.env.AVEC_API_TOKEN) || isAvecMock()
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

/** Intervalo em datas de calendário America/Sao_Paulo (não UTC do servidor). */
export function periodRange(daysBack = 0, daysForward = 14) {
  const today = todayIso()
  return {
    inicio: fmtBrFromYmd(addCalendarDays(today, -daysBack)),
    fim: fmtBrFromYmd(addCalendarDays(today, daysForward)),
  }
}

// Extrai linhas do JSON de relatório — formato varia por endpoint.
export function extractRows(payload: unknown): Record<string, unknown>[] {
  if (!payload) return []
  if (Array.isArray(payload)) return payload as Record<string, unknown>[]
  if (typeof payload !== 'object') return []

  const obj = payload as Record<string, unknown>
  for (const key of ['data', 'rows', 'result', 'items', 'registros', 'lista']) {
    const val = obj[key]
    if (Array.isArray(val)) return val as Record<string, unknown>[]
  }

  // Alguns relatórios retornam { data: { rows: [...] } }
  if (obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data)) {
    const nested = obj.data as Record<string, unknown>
    for (const key of ['rows', 'items', 'data']) {
      if (Array.isArray(nested[key])) return nested[key] as Record<string, unknown>[]
    }
  }

  return []
}

export async function fetchAvecReport(reportId: string, params: AvecReportParams = {}) {
  assertAvecMockAllowed()
  if (isAvecMock()) {
    return getMockReport(reportId, params.page ?? 1)
  }

  const { baseUrl, token } = getConfig()
  const qs = new URLSearchParams()
  qs.set('page', String(params.page ?? 1))
  qs.set('limit', String(params.limit ?? 250))
  for (const [k, v] of Object.entries(params)) {
    if (k === 'page' || k === 'limit' || v === undefined) continue
    qs.set(k, String(v))
  }

  const url = `${baseUrl}/reports/${reportId}?${qs}`
  const res = await fetch(url, {
    headers: { Authorization: token, Accept: 'application/json' },
    cache: 'no-store',
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Avec ${reportId} HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`)
  }

  return res.json()
}

// Pagina automaticamente até esgotar ou atingir maxPages.
export interface AvecReportFetchResult {
  rows: Record<string, unknown>[]
  truncated: boolean
  pagesFetched: number
  maxPages: number
  limit: number
}

export const AVEC_PAGE_LIMIT = 250
/** Padrão: 200 páginas × 250 linhas = até 50.000 registros por relatório. */
export const AVEC_SYNC_MAX_PAGES_DEFAULT = 200

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
}

export function wasPaginationTruncated(rowsOnLastPage: number, limit: number, page: number, maxPages: number) {
  return page >= maxPages && rowsOnLastPage >= limit
}

export function formatTruncationWarning(reportId: string, result: AvecReportFetchResult) {
  const label = AVEC_REPORT_LABELS[reportId] ?? reportId
  return `Relatório ${label} (${reportId}) atingiu o limite de ${result.maxPages} páginas (${result.rows.length} linhas, ${result.limit}/página). Pode haver dados não sincronizados — aumente AVEC_SYNC_MAX_PAGES na Vercel.`
}

export async function fetchAllAvecReport(
  reportId: string,
  params: AvecReportParams = {},
  maxPages = getAvecSyncMaxPages()
): Promise<AvecReportFetchResult> {
  const limit = params.limit ?? AVEC_PAGE_LIMIT
  const all: Record<string, unknown>[] = []
  let pagesFetched = 0
  let truncated = false

  for (let page = 1; page <= maxPages; page++) {
    const payload = await fetchAvecReport(reportId, { ...params, page, limit })
    const rows = extractRows(payload)
    pagesFetched = page
    if (rows.length === 0) break
    all.push(...rows)
    if (rows.length < limit) break
    if (wasPaginationTruncated(rows.length, limit, page, maxPages)) truncated = true
  }

  return { rows: all, truncated, pagesFetched, maxPages, limit }
}
