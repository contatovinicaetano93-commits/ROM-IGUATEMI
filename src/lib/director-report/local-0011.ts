/**
 * 0011 local para salões onde a Avec não oferece o relatório 0011 (ex.: Iguatemi).
 *
 * Semântica (trimestre Q):
 * - P1 = trimestre anterior
 * - P2 = Q
 * - Cohort por profissional = clientes atendidos (0002) em P1 com aquele pro
 * - Retornaram = cohort que também aparece no 0002 de P2
 * - Lista reativar = cohort − retornaram
 * - Taxa = retornaram / cohort
 *
 * Taxa do salão (0007) fica como fallback quando o pro não tem cohort.
 */

import {
  extractReportTotals,
  extractRows,
  fetchAvecReport,
  fmtAvecDate,
} from '@/lib/avec/client'
import { normalizeAttendanceRow, normalizeP3ReturnRateRow } from '@/lib/avec/normalize'
import { matchDirectorProfessional } from './match-pro'
import { labelQuarter } from './period'
import type {
  DirectorProfessional,
  QuarterKey,
  ReactivationClient,
} from './types'

function quarterRangeBr(quarter: QuarterKey): { inicio: string; fim: string } {
  const [yStr, qStr] = quarter.split('-Q')
  const y = Number(yStr)
  const q = Number(qStr) as 1 | 2 | 3 | 4
  if (!y || !q || q < 1 || q > 4) throw new Error(`Trimestre inválido: ${quarter}`)
  const startMonth = (q - 1) * 3
  const start = new Date(y, startMonth, 1)
  const end = new Date(y, startMonth + 3, 0)
  return { inicio: fmtAvecDate(start), fim: fmtAvecDate(end) }
}

export type Local0011Agg = {
  clients: ReactivationClient[]
  returnRates: number[]
  clientsTotalHint: number
  clientsReturnedHint: number
}

export type Local0011QuarterResult = {
  byPro: Map<string, Local0011Agg>
  salonRates: number[]
  truncated: boolean
  source: 'local' | 'none'
  note: string | null
}

export type Local0011Budget = {
  deadlineAt: number | null
  maxPages: number
}

type AvecClientRow = {
  key: string
  name: string
  email: string | null
  phone: string | null
  mobile: string | null
  lastVisit: string | null
  proNames: string[]
}

export function previousQuarterKey(quarter: QuarterKey): QuarterKey {
  const [yStr, qStr] = quarter.split('-Q')
  const y = Number(yStr)
  const q = Number(qStr)
  if (!y || !q || q < 1 || q > 4) throw new Error(`Trimestre inválido: ${quarter}`)
  if (q === 1) return `${y - 1}-Q4` as QuarterKey
  return `${y}-Q${(q - 1) as 1 | 2 | 3}` as QuarterKey
}

/** Chave estável para casar o mesmo cliente entre trimestres. */
export function local0011ClientKey(phone: string | null, name: string | null): string | null {
  const digits = (phone ?? '').replace(/\D/g, '')
  if (digits.length >= 8) return `p:${digits.slice(-11)}`
  const n = (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  if (n.length >= 3) return `n:${n}`
  return null
}

/** `todas_os_profissionais` vem "A,B,C". */
export function splitAvecProfessionalNames(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw
    .split(/[,;|/]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2)
}

function daysSince(iso: string) {
  const t = new Date(iso + 'T12:00:00').getTime()
  return Math.max(0, Math.floor((Date.now() - t) / 86400000))
}

function toClient(row: AvecClientRow): ReactivationClient {
  const last =
    row.lastVisit ??
    new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10)
  const days = daysSince(last)
  return {
    name: row.name,
    email: row.email,
    phone: row.phone,
    mobile: row.mobile,
    gender: null,
    last_visit: last,
    days_since: days,
    suggested_action:
      days > 90
        ? 'Mensagem de retorno + oferta de manutenção'
        : 'Convite para reagendar no horário preferido',
  }
}

async function fetch0002QuarterClients(
  quarter: QuarterKey,
  budget: Local0011Budget,
  maxPages: number,
): Promise<{ clients: AvecClientRow[]; truncated: boolean }> {
  const { inicio, fim } = quarterRangeBr(quarter)
  const clients: AvecClientRow[] = []
  const seen = new Set<string>()
  let truncated = false

  for (let page = 1; page <= maxPages; page++) {
    if (budget.deadlineAt != null && Date.now() >= budget.deadlineAt) {
      truncated = true
      break
    }
    // 0002 em trimestres cheios pode passar de 30s — tolera até 55s/página.
    const payload = await fetchAvecReport(
      '0002',
      {
        inicio,
        fim,
        como_conheceu: '',
        limit: 250,
        page,
      },
      { timeoutMs: 55_000 },
    )
    const rows = extractRows(payload)
    if (rows.length === 0) break
    for (const row of rows) {
      const att = normalizeAttendanceRow(row)
      if (!att?.clientName) continue
      const phone = att.phone
      const key = local0011ClientKey(phone, att.clientName)
      if (!key || seen.has(key)) continue
      seen.add(key)
      const proRaw =
        typeof row.todas_os_profissionais === 'string'
          ? row.todas_os_profissionais
          : att.professional
      const email =
        typeof row.email === 'string' && row.email.trim() ? row.email.trim() : null
      clients.push({
        key,
        name: att.clientName,
        email,
        phone,
        mobile: phone,
        lastVisit: att.lastVisitDay,
        proNames: splitAvecProfessionalNames(proRaw),
      })
    }
    if (rows.length < 250) break
    if (page === maxPages) truncated = true
  }

  return { clients, truncated }
}

async function fetch0007SalonAndNonReturners(
  quarter: QuarterKey,
  budget: Local0011Budget,
  maxPages = 3,
): Promise<{ rate: number | null; nonReturnerKeys: Set<string> }> {
  const nonReturnerKeys = new Set<string>()
  let rate: number | null = null
  if (budget.deadlineAt != null && Date.now() >= budget.deadlineAt) {
    return { rate, nonReturnerKeys }
  }
  const { inicio, fim } = quarterRangeBr(quarter)
  try {
    for (let page = 1; page <= maxPages; page++) {
      if (budget.deadlineAt != null && Date.now() >= budget.deadlineAt) break
      const payload = await fetchAvecReport(
        '0007',
        { inicio, fim, limit: 250, page },
        { timeoutMs: 40_000 },
      )
      if (rate == null) {
        for (const total of extractReportTotals(payload)) {
          const r = normalizeP3ReturnRateRow(total)
          if (r != null) {
            rate = r
            break
          }
        }
      }
      const rows = extractRows(payload)
      if (rows.length === 0) break
      for (const row of rows) {
        const att = normalizeAttendanceRow(row)
        const name =
          att?.clientName ??
          (typeof row.nome === 'string' ? row.nome : null)
        const phone =
          att?.phone ??
          (typeof row.celular === 'string' ? row.celular : null)
        const key = local0011ClientKey(phone, name)
        if (key) nonReturnerKeys.add(key)
      }
      if (rows.length < 250) break
    }
  } catch {
    // opcional
  }
  return { rate, nonReturnerKeys }
}

/**
 * Agrega cohort P1 → retorno em P2 por profissional do roster.
 * Preferência: lista 0007 de não-retornados (mais fiel); senão ∩ amostra 0002 P2.
 * `byPro` keys = nome do roster (match depois no avec-live).
 */
export function aggregateLocal0011ByPro(
  p1Clients: AvecClientRow[],
  p2Clients: AvecClientRow[],
  professionals: DirectorProfessional[],
  nonReturnerKeys?: Set<string>,
): Map<string, Local0011Agg> {
  const p2Keys = new Set(p2Clients.map((c) => c.key))
  const byProId = new Map<
    string,
    {
      proName: string
      cohort: Map<string, AvecClientRow>
    }
  >()

  for (const client of p1Clients) {
    const matched = new Set<string>()
    for (const raw of client.proNames) {
      const pro = matchDirectorProfessional(raw, professionals)
      if (!pro || matched.has(pro.id)) continue
      matched.add(pro.id)
      const bucket = byProId.get(pro.id) ?? {
        proName: pro.name,
        cohort: new Map(),
      }
      bucket.cohort.set(client.key, client)
      byProId.set(pro.id, bucket)
    }
  }

  const out = new Map<string, Local0011Agg>()
  for (const [, bucket] of byProId) {
    const total = bucket.cohort.size
    if (total === 0) continue
    const nonReturners: ReactivationClient[] = []
    let nonReturnCount = 0
    for (const [key, row] of bucket.cohort) {
      const isNonReturner = nonReturnerKeys
        ? nonReturnerKeys.has(key)
        : !p2Keys.has(key)
      if (!isNonReturner) continue
      nonReturnCount++
      nonReturners.push(toClient(row))
    }
    const returned = Math.max(0, total - nonReturnCount)
    const rate = returned / total
    nonReturners.sort((a, b) => b.days_since - a.days_since)
    out.set(bucket.proName, {
      clients: nonReturners,
      returnRates: [Math.round(rate * 1000) / 1000],
      clientsTotalHint: total,
      clientsReturnedHint: returned,
    })
  }
  return out
}

function buildQuarterResult(
  quarter: QuarterKey,
  prior: QuarterKey,
  p1: { clients: AvecClientRow[]; truncated: boolean },
  p2: { clients: AvecClientRow[]; truncated: boolean },
  salonRate: number | null,
  professionals: DirectorProfessional[],
  nonReturnerKeys?: Set<string>,
): Local0011QuarterResult {
  const byPro = aggregateLocal0011ByPro(
    p1.clients,
    p2.clients,
    professionals,
    nonReturnerKeys && nonReturnerKeys.size > 0 ? nonReturnerKeys : undefined,
  )
  const salonRates = salonRate != null ? [salonRate] : []
  const truncated = p1.truncated || p2.truncated
  const hasData = byPro.size > 0

  if (!hasData && salonRates.length === 0) {
    return {
      byPro,
      salonRates,
      truncated,
      source: 'none',
      note: `0011 local sem cohort 0002 (${prior}→${quarter})`,
    }
  }

  return {
    byPro,
    salonRates,
    truncated,
    source: hasData ? 'local' : 'none',
    note: hasData
      ? `0011 local via 0002+0007 (${labelQuarter(prior)}→${labelQuarter(quarter)}; por profissional)`
      : `0011 local sem match por pro — taxa salão 0007`,
  }
}

/** Busca 0011 local para um trimestre (P1 = tri anterior, P2 = tri). */
export async function fetchLocal0011Quarter(
  quarter: QuarterKey,
  professionals: DirectorProfessional[],
  budget: Local0011Budget,
): Promise<Local0011QuarterResult> {
  const prior = previousQuarterKey(quarter)
  // UI: poucas páginas — Avec 0002 pode levar >20s/página em tris cheios.
  const pagesPerPeriod = Math.max(1, Math.min(2, Math.floor(budget.maxPages / 2) || 2))

  const [p1Result, p2Result, r7] = await Promise.all([
    fetch0002QuarterClients(prior, budget, pagesPerPeriod),
    fetch0002QuarterClients(quarter, budget, pagesPerPeriod),
    fetch0007SalonAndNonReturners(quarter, budget, 2),
  ])

  return buildQuarterResult(
    quarter,
    prior,
    p1Result,
    p2Result,
    r7.rate,
    professionals,
    r7.nonReturnerKeys,
  )
}

/**
 * Pair selected/compare compartilhando o 0002 do trimestre do meio
 * (ex.: Q2 vs Q1 → busca Q0, Q1, Q2 uma vez cada).
 * Avec 0002 pode levar ~30s/página — 1 página + allSettled evita derrubar o relatório.
 */
export async function fetchLocal0011QuarterPair(
  selectedQuarter: QuarterKey,
  compareQuarter: QuarterKey,
  professionals: DirectorProfessional[],
  budget: Local0011Budget,
): Promise<{ selected: Local0011QuarterResult; compare: Local0011QuarterResult }> {
  const selPrior = previousQuarterKey(selectedQuarter)
  const cmpPrior = previousQuarterKey(compareQuarter)
  // Prioriza o trimestre foco (selected + prior). Compare completo só se couber no budget.
  const primary = [...new Set([selPrior, selectedQuarter])]
  const secondary = [cmpPrior, compareQuarter].filter((q) => !primary.includes(q))
  const pagesPerPeriod = 1

  const byQuarter = new Map<QuarterKey, { clients: AvecClientRow[]; truncated: boolean }>()
  const empty = { clients: [] as AvecClientRow[], truncated: true }

  // Sequencial: paralelo na Avec estoura timeout com frequência.
  for (const q of [...primary, ...secondary]) {
    if (budget.deadlineAt != null && Date.now() >= budget.deadlineAt) break
    // Secondary só se ainda houver folga (~20s) para não estourar o teto da UI.
    if (secondary.includes(q)) {
      const left =
        budget.deadlineAt == null ? Number.POSITIVE_INFINITY : budget.deadlineAt - Date.now()
      if (left < 20_000) break
    }
    try {
      byQuarter.set(q, await fetch0002QuarterClients(q, budget, pagesPerPeriod))
    } catch (e) {
      console.warn(`[local-0011] 0002 ${q} falhou:`, e instanceof Error ? e.message : e)
    }
  }

  // 0007 do foco primeiro (taxa + não-retornados); compare só taxa se sobrar tempo.
  const sel7 = await fetch0007SalonAndNonReturners(selectedQuarter, budget, 3)
  let cmp7: { rate: number | null; nonReturnerKeys: Set<string> } = {
    rate: null,
    nonReturnerKeys: new Set(),
  }
  const left7 =
    budget.deadlineAt == null ? Number.POSITIVE_INFINITY : budget.deadlineAt - Date.now()
  if (left7 > 12_000) {
    cmp7 = await fetch0007SalonAndNonReturners(compareQuarter, budget, 2)
  }

  return {
    selected: buildQuarterResult(
      selectedQuarter,
      selPrior,
      byQuarter.get(selPrior) ?? empty,
      byQuarter.get(selectedQuarter) ?? empty,
      sel7.rate,
      professionals,
      sel7.nonReturnerKeys,
    ),
    compare: buildQuarterResult(
      compareQuarter,
      cmpPrior,
      byQuarter.get(cmpPrior) ?? empty,
      byQuarter.get(compareQuarter) ?? empty,
      cmp7.rate,
      professionals,
      cmp7.nonReturnerKeys.size > 0 ? cmp7.nonReturnerKeys : undefined,
    ),
  }
}
