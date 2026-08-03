import {
  extractReportTotals,
  extractRows,
  fetchAllAvecReport,
  fetchAvecReport,
  fmtAvecDate,
  getAvecSyncMaxPages,
} from '@/lib/avec/client'
import {
  isP3NonReturnerRow,
  normalize0011ReactivationRow,
  normalizeP1ProfessionalRevenueRow,
  normalizeP3ReturnRateRow,
} from '@/lib/avec/normalize'
import { getAvecReportRegistry, resolveReportId } from '@/lib/avec/registry'
import { getRomPanelId } from '@/lib/brand'
import { toSalonDateIso } from '@/lib/salon/format'
import { resolveMonthWindow } from '@/lib/salon/month-window'
import { fetchLocal0011Quarter, fetchLocal0011QuarterPair } from './local-0011'
import { matchDirectorProfessional } from './match-pro'
import {
  aggregateQuarterRevenue,
  labelMonth,
  labelQuarter,
  monthsInComparableQuarter,
} from './period'
import type {
  DirectorProfessional,
  MonthKey,
  MonthRevenueRow,
  ProfessionalReturnBlock,
  ProfessionalRevenueBlock,
  QuarterKey,
  ReactivationClient,
  ReturnQuarterRow,
} from './types'

/** Iguatemi: Avec devolve 400 "não suportado" no 0011 — usa 0002 local (+ 0007 taxa). */
function shouldSkipAvec0011(): boolean {
  if (process.env.AVEC_SKIP_REPORT_0011 === '1' || process.env.AVEC_SKIP_REPORT_0011 === 'true') {
    return true
  }
  return getRomPanelId() === 'iguatemi'
}

function resolveMapperId(mapper: string): string | null {
  const def = getAvecReportRegistry().find((r) => r.mapper === mapper)
  if (!def) return null
  return resolveReportId(def)
}

/** Intervalo dd/mm/yyyy do mês (MTD no mês corrente — alinha Visão/Financeiro). */
export function monthRangeBr(month: MonthKey, referenceDay?: string): { inicio: string; fim: string } {
  const w = resolveMonthWindow(month, referenceDay)
  const [fy, fm, fd] = w.from.split('-').map(Number)
  const [ty, tm, td] = w.to.split('-').map(Number)
  if (!fy || !fm || !fd || !ty || !tm || !td) throw new Error(`Mês inválido: ${month}`)
  return {
    inicio: fmtAvecDate(new Date(fy, fm - 1, fd)),
    fim: fmtAvecDate(new Date(ty, tm - 1, td)),
  }
}

/** Intervalo dd/mm/yyyy do trimestre (YYYY-Qn). Trimestre aberto fecha em referenceDay. */
export function quarterRangeBr(
  quarter: QuarterKey,
  referenceDay?: string,
): { inicio: string; fim: string } {
  const [yStr, qStr] = quarter.split('-Q')
  const y = Number(yStr)
  const q = Number(qStr) as 1 | 2 | 3 | 4
  if (!y || !q || q < 1 || q > 4) throw new Error(`Trimestre inválido: ${quarter}`)
  const startMonth = (q - 1) * 3
  const start = new Date(y, startMonth, 1)
  let end = new Date(y, startMonth + 3, 0)
  const today = referenceDay
    ? (() => {
        const [ty, tm, td] = referenceDay.split('-').map(Number)
        if (!ty || !tm || !td) throw new Error(`Dia inválido: ${referenceDay}`)
        return new Date(ty, tm - 1, td)
      })()
    : new Date()
  const todayLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  if (end.getTime() > todayLocal.getTime()) end = todayLocal
  return { inicio: fmtAvecDate(start), fim: fmtAvecDate(end) }
}

function daysSince(iso: string) {
  const t = new Date(iso + 'T12:00:00').getTime()
  return Math.max(0, Math.floor((Date.now() - t) / 86400000))
}

function suggestedAction(days: number) {
  return days > 90
    ? 'Mensagem de retorno + oferta de manutenção'
    : 'Convite para reagendar no horário preferido'
}

function toReactivationClient(c: {
  name: string
  email: string | null
  phone: string | null
  mobile: string | null
  gender: string | null
  lastVisit: string | null
}): ReactivationClient {
  const last =
    c.lastVisit ??
    toSalonDateIso(new Date(Date.now() - 60 * 86400000)) ??
    new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10)
  const days = daysSince(last)
  return {
    name: c.name,
    email: c.email,
    phone: c.phone,
    mobile: c.mobile,
    gender: c.gender,
    last_visit: last,
    days_since: days,
    suggested_action: suggestedAction(days),
  }
}

function emptyMonthRow(month: MonthKey): MonthRevenueRow {
  return {
    month,
    label: labelMonth(month),
    revenue: 0,
    ticket_avg: 0,
    attended: 0,
  }
}

/** Budget interativo: caber no abort ~90–120s do browser. */
export const DIRECTOR_UI_BUDGET_MS = 45_000
export const DIRECTOR_UI_MAX_PAGES = 8
export const DIRECTOR_UI_SLIM_MAX_PAGES = 6

export type DirectorFetchBudget = {
  deadlineAt: number | null
  maxPages: number
}

export function directorUiBudget(now = Date.now(), maxPages = DIRECTOR_UI_MAX_PAGES): DirectorFetchBudget {
  return {
    deadlineAt: now + DIRECTOR_UI_BUDGET_MS,
    maxPages,
  }
}

export function directorFullBudget(): DirectorFetchBudget {
  return { deadlineAt: null, maxPages: getAvecSyncMaxPages() }
}

async function fetch0021Month(
  month: MonthKey,
  budget: DirectorFetchBudget = directorFullBudget(),
): Promise<Map<string, { revenue: number; attended: number; ticketAvg: number }>> {
  const id = resolveMapperId('professionals_revenue') ?? '0021'
  const { inicio, fim } = monthRangeBr(month)
  const { rows } = await fetchAllAvecReport(
    id,
    { inicio, fim, limit: 250 },
    Math.min(budget.maxPages, 20),
    { deadlineAt: budget.deadlineAt },
  )
  const byName = new Map<string, { revenue: number; attended: number; ticketAvg: number }>()

  for (const row of rows) {
    const p = normalizeP1ProfessionalRevenueRow(row)
    if (!p) continue
    const cur = byName.get(p.name) ?? { revenue: 0, attended: 0, ticketAvg: 0 }
    cur.revenue += p.revenue
    cur.attended += p.attended
    cur.ticketAvg = cur.attended > 0 ? cur.revenue / cur.attended : p.ticketAvg
    byName.set(p.name, cur)
  }
  return byName
}

/** Todos os meses de 2025 até `latest` (inclusive) — usado no perfil individual (022). */
function allMonthsUpTo(latest: MonthKey): MonthKey[] {
  const [yStr, mStr] = latest.split('-')
  const endY = Number(yStr)
  const endM = Number(mStr)
  const out: MonthKey[] = []
  for (let y = 2025; y <= endY; y++) {
    const lastM = y === endY ? endM : 12
    for (let m = 1; m <= lastM; m++) {
      out.push(`${y}-${String(m).padStart(2, '0')}` as MonthKey)
    }
  }
  return out
}

/** Série mensal completa (2025 → mês atual) de um único profissional — perfil individual (022). */
export async function fetchProfessionalProfileMonths(
  professional: DirectorProfessional,
  latestMonth: MonthKey,
): Promise<MonthRevenueRow[]> {
  const months = allMonthsUpTo(latestMonth)
  async function fetchProfessionalMonth(m: MonthKey): Promise<MonthRevenueRow> {
    try {
      const map = await fetch0021Month(m)
      let hit: { revenue: number; attended: number; ticketAvg: number } | undefined
      for (const [avecName, stats] of map) {
        if (matchDirectorProfessional(avecName, [professional])) {
          hit = stats
          break
        }
      }
      return hit
        ? {
            month: m,
            label: labelMonth(m),
            revenue: Math.round(hit.revenue),
            ticket_avg: Math.round(hit.ticketAvg),
            attended: hit.attended,
          }
        : emptyMonthRow(m)
    } catch {
      return emptyMonthRow(m)
    }
  }

  const rows: MonthRevenueRow[] = []
  for (let i = 0; i < months.length; i += 3) {
    const chunk = months.slice(i, i + 3)
    rows.push(...(await Promise.all(chunk.map(fetchProfessionalMonth))))
  }
  return rows
}

type QuarterAgg = {
  clients: ReactivationClient[]
  returnRates: number[]
  clientsTotalHint: number
  clientsReturnedHint: number
}

async function fetch0011Quarter(
  quarter: QuarterKey,
  budget: DirectorFetchBudget,
  professionals: DirectorProfessional[],
): Promise<{
  byPro: Map<string, QuarterAgg>
  salonRates: number[]
  truncated: boolean
  source: '0011' | '0007' | 'local' | 'none'
  note: string | null
}> {
  const id = resolveMapperId('director_return') ?? '0011'
  const { inicio, fim } = quarterRangeBr(quarter)
  const byPro = new Map<string, QuarterAgg>()
  const salonRates: number[] = []
  let truncated = false
  let source: '0011' | '0007' | 'local' | 'none' = 'none'
  let note: string | null = null
  const skip0011 = shouldSkipAvec0011() || id === '0007'

  // 0) Iguatemi: 0011 Avec não existe — monta por profissional via 0002 (P1→P2).
  if (skip0011 && professionals.length > 0) {
    try {
      const local = await fetchLocal0011Quarter(quarter, professionals, budget)
      truncated = local.truncated
      for (const rate of local.salonRates) salonRates.push(rate)
      for (const [proName, agg] of local.byPro) {
        byPro.set(proName, {
          clients: agg.clients,
          returnRates: agg.returnRates,
          clientsTotalHint: agg.clientsTotalHint,
          clientsReturnedHint: agg.clientsReturnedHint,
        })
      }
      if (local.source === 'local') {
        source = 'local'
        note = local.note
        return { byPro, salonRates, truncated, source, note }
      }
      note = local.note
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      note = `0011 local falhou: ${msg.slice(0, 120)}`
      console.warn(`[director-report] local 0011 ${quarter}: ${msg}`)
    }
  }

  // 1) Tenta 0011 Avec — Iguatemi/skip: não chama (400 "não suportado").
  if (!skip0011) {
    try {
      const result = await fetchAllAvecReport(
        id,
        { inicio, fim, limit: 250 },
        budget.maxPages,
        { deadlineAt: budget.deadlineAt },
      )
      if (result.truncated) {
        console.warn(`[director-report] 0011 ${quarter} truncado em ${budget.maxPages} páginas / budget`)
      }
      truncated = result.truncated
      source = '0011'

      for (const row of result.rows) {
        const c = normalize0011ReactivationRow(row)
        if (!c) continue

        if (c.returnRate != null && (!c.lastVisit || c.name === '—')) {
          salonRates.push(c.returnRate)
          if (c.professional) {
            const agg = byPro.get(c.professional) ?? {
              clients: [],
              returnRates: [],
              clientsTotalHint: 0,
              clientsReturnedHint: 0,
            }
            agg.returnRates.push(c.returnRate)
            byPro.set(c.professional, agg)
          }
          continue
        }

        const proName = c.professional ?? '_unassigned'
        const agg = byPro.get(proName) ?? {
          clients: [],
          returnRates: [],
          clientsTotalHint: 0,
          clientsReturnedHint: 0,
        }
        // Lista 0011 = clientes SEM retorno — não usar “taxa” por linha de cliente
        // (Avec manda flag/coluna ambígua → média virava 100%).
        if (c.name && c.name !== '—') {
          agg.clients.push(
            toReactivationClient({
              name: c.name,
              email: c.email,
              phone: c.phone,
              mobile: c.mobile,
              gender: c.gender,
              lastVisit: c.lastVisit,
            }),
          )
        }
        byPro.set(proName, agg)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      note = `0011 indisponível (${msg.slice(0, 120)})`
      console.warn(`[director-report] 0011 ${quarter}: ${msg}`)
    }
  }

  const hasRates =
    salonRates.length > 0 ||
    [...byPro.values()].some(
      (a) =>
        a.returnRates.length > 0 ||
        (a.clientsTotalHint > 0 && a.clientsReturnedHint >= 0),
    )
  const hasClients = [...byPro.values()].some((a) => a.clients.length > 0)

  // 2) Fallback 0007: taxa do salão mesmo quando já há lista sem taxa.
  const timeLeft =
    budget.deadlineAt == null ? Number.POSITIVE_INFINITY : budget.deadlineAt - Date.now()
  const need0007 = !hasRates && timeLeft > 8_000
  if (need0007) {
    const id0007 = resolveMapperId('return_rate') ?? '0007'
    try {
      const fallback = await fetch0007QuarterFallback(id0007, inicio, fim, budget)
      truncated = truncated || fallback.truncated
      if (fallback.salonRate != null) salonRates.push(fallback.salonRate)

      const agg = byPro.get('_unassigned') ?? {
        clients: [],
        returnRates: [],
        clientsTotalHint: 0,
        clientsReturnedHint: 0,
      }
      if (fallback.salonRate != null) {
        agg.returnRates.push(fallback.salonRate)
        if (fallback.clientsTotalHint > 0) {
          agg.clientsTotalHint = fallback.clientsTotalHint
          agg.clientsReturnedHint = fallback.clientsReturnedHint
        }
      }
      for (const c of fallback.clients) {
        agg.clients.push(c)
      }
      byPro.set('_unassigned', agg)
      if (!hasClients) {
        source = '0007'
        note =
          'Etapa 0011 via 0007 (taxa do salão; lista sem profissional — filtre 1 pro para ver clientes)'
      } else {
        note = note ?? '0011 lista + taxa 0007 do salão'
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      note = `0007 falhou: ${msg.slice(0, 140)}`
      console.warn(`[director-report] 0007 ${quarter}: ${msg}`)
    }
  }

  if (!hasRates && !hasClients && source !== '0007') source = 'none'
  return { byPro, salonRates, truncated, source, note }
}

/** 0007: taxa em `report.total`; linhas = clientes que NÃO retornaram. */
async function fetch0007QuarterFallback(
  reportId: string,
  inicio: string,
  fim: string,
  budget: DirectorFetchBudget,
): Promise<{
  salonRate: number | null
  clients: ReactivationClient[]
  clientsTotalHint: number
  clientsReturnedHint: number
  truncated: boolean
}> {
  const maxPages = Math.min(4, budget.maxPages)
  const clients: ReactivationClient[] = []
  let salonRate: number | null = null
  let clientsTotalHint = 0
  let clientsReturnedHint = 0
  let truncated = false
  let pagesFetched = 0

  for (let page = 1; page <= maxPages; page++) {
    if (budget.deadlineAt != null && Date.now() >= budget.deadlineAt) {
      truncated = true
      break
    }
    const payload = await fetchAvecReport(reportId, { inicio, fim, limit: 250, page })
    pagesFetched = page

    if (salonRate == null) {
      for (const total of extractReportTotals(payload)) {
        const rate = normalizeP3ReturnRateRow(total)
        if (rate != null) {
          salonRate = rate
          const first = Number(
            total.total_primeiro_periodo ?? total.total_primeiro ?? total.total ?? 0,
          )
          const returned = Number(total.total_retornaram ?? total.retornaram ?? 0)
          if (Number.isFinite(first) && first > 0) {
            clientsTotalHint = first
            clientsReturnedHint = Number.isFinite(returned) ? returned : Math.round(first * rate)
          }
          break
        }
      }
    }

    const rows = extractRows(payload)
    if (rows.length === 0) break
    for (const row of rows) {
      if (!isP3NonReturnerRow(row)) continue
      const c = normalize0011ReactivationRow(row)
      if (!c || !c.name || c.name === '—') continue
      clients.push(
        toReactivationClient({
          name: c.name,
          email: c.email,
          phone: c.phone,
          mobile: c.mobile,
          gender: c.gender,
          lastVisit: c.lastVisit,
        }),
      )
    }
    if (rows.length < 250) break
    if (page === maxPages) truncated = true
  }

  if (pagesFetched === 0) truncated = true
  return { salonRate, clients, clientsTotalHint, clientsReturnedHint, truncated }
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

/**
 * Taxa por profissional — só com evidência própria (taxa/cohort do pro).
 * Nunca clona a taxa do salão em cada linha (várias % iguais = bug).
 * Sem evidência → null (UI "—").
 */
export function resolveDirectorReturnRate(opts: {
  returnRates: number[]
  nonReturnerCount: number
  salonRate: number | null
  clientsTotalHint?: number
  clientsReturnedHint?: number
  /** true só na linha agregada "Salão". */
  allowSalonFallback?: boolean
}): number | null {
  const hintTotal = opts.clientsTotalHint ?? 0
  const hintReturned = opts.clientsReturnedHint ?? 0
  if (hintTotal > 0 && hintReturned >= 0 && hintReturned <= hintTotal) {
    return Math.round((hintReturned / hintTotal) * 1000) / 1000
  }

  const fromRates = avg(opts.returnRates)
  if (fromRates != null) {
    if (opts.nonReturnerCount > 0 && fromRates >= 0.999) return null
    return Math.round(fromRates * 1000) / 1000
  }

  if (opts.allowSalonFallback && opts.salonRate != null) {
    return Math.round(opts.salonRate * 1000) / 1000
  }
  return null
}

function buildQuarterRow(
  quarter: QuarterKey,
  agg: QuarterAgg | undefined,
  salonRate: number | null,
  prevRate: number | null,
  allowSalonFallback = false,
): ReturnQuarterRow {
  const listN = agg?.clients.length ?? 0
  const return_rate = resolveDirectorReturnRate({
    returnRates: agg?.returnRates ?? [],
    nonReturnerCount: listN,
    salonRate,
    clientsTotalHint: agg?.clientsTotalHint,
    clientsReturnedHint: agg?.clientsReturnedHint,
    allowSalonFallback,
  })

  const clients_total = listN > 0 ? listN : agg?.clientsTotalHint || 0
  const clients_returned =
    agg?.clientsReturnedHint && agg.clientsReturnedHint > 0
      ? agg.clientsReturnedHint
      : listN === 0 && clients_total > 0 && return_rate != null && return_rate > 0
        ? Math.round(clients_total * return_rate)
        : 0

  return {
    quarter,
    label: labelQuarter(quarter),
    return_rate,
    clients_total,
    clients_returned,
    delta_vs_prev:
      prevRate == null || return_rate == null
        ? null
        : Math.round((return_rate - prevRate) * 1000) / 10,
  }
}

export interface LiveDirectorBlocks {
  /** null = etapa 0011 falhou ao montar (bug/exceção) — caller deixa bloco vazio (sem fixture). */
  return_blocks: ProfessionalReturnBlock[] | null
  /** null = etapa 0021 falhou ao montar (bug/exceção) — caller deixa bloco vazio (sem fixture). */
  revenue_blocks: ProfessionalRevenueBlock[] | null
  warnings: string[]
}

export type LiveDirectorStage = '0011' | '0021' | 'all'

/**
 * Busca 0011 e/ou 0021 na Avec e monta blocos do relatório.
 * Match por nome (e avec_pro_id quando preenchido).
 * `stages` evita buscar a etapa não pedida (UI carrega 0011 sem esperar 0021).
 */
export async function fetchLiveDirectorBlocks(
  professionals: DirectorProfessional[],
  selectedMonth: MonthKey,
  selectedQuarter0021: QuarterKey,
  compareQuarter0021: QuarterKey | null,
  selectedQuarter: QuarterKey,
  compareQuarter: QuarterKey,
  opts?: {
    stages?: LiveDirectorStage
    maxPages0011?: number
    budget?: DirectorFetchBudget
  },
): Promise<LiveDirectorBlocks> {
  const warnings: string[] = []
  const stages = opts?.stages ?? 'all'
  const want0011 = stages === '0011' || stages === 'all'
  const want0021 = stages === '0021' || stages === 'all'
  const budget =
    opts?.budget ??
    (opts?.maxPages0011 != null
      ? directorUiBudget(Date.now(), opts.maxPages0011)
      : directorFullBudget())

  const monthsNeeded = new Set<MonthKey>(want0021 ? [selectedMonth] : [])
  if (want0021 && compareQuarter0021) {
    for (const m of monthsInComparableQuarter(
      selectedQuarter0021,
      selectedMonth,
      selectedQuarter0021,
      compareQuarter0021
    )) {
      monthsNeeded.add(m)
    }
    for (const m of monthsInComparableQuarter(
      compareQuarter0021,
      selectedMonth,
      selectedQuarter0021,
      compareQuarter0021
    )) {
      monthsNeeded.add(m)
    }
  }

  const monthMaps = new Map<
    MonthKey,
    Map<string, { revenue: number; attended: number; ticketAvg: number }>
  >()

  if (want0021) {
    await Promise.all(
      [...monthsNeeded].map(async (m) => {
        try {
          monthMaps.set(m, await fetch0021Month(m, budget))
        } catch (e) {
          warnings.push(`0021 ${m}: ${e instanceof Error ? e.message : String(e)}`)
          monthMaps.set(m, new Map())
        }
      }),
    )
  }

  let selectedQ: Awaited<ReturnType<typeof fetch0011Quarter>> = {
    byPro: new Map(),
    salonRates: [],
    truncated: false,
    source: 'none',
    note: null,
  }
  let compareQ: Awaited<ReturnType<typeof fetch0011Quarter>> = {
    byPro: new Map(),
    salonRates: [],
    truncated: false,
    source: 'none',
    note: null,
  }

  if (want0011) {
    if (shouldSkipAvec0011() && professionals.length > 0) {
      try {
        const pair = await fetchLocal0011QuarterPair(
          selectedQuarter,
          compareQuarter,
          professionals,
          budget,
        )
        selectedQ = {
          byPro: pair.selected.byPro,
          salonRates: pair.selected.salonRates,
          truncated: pair.selected.truncated,
          source: pair.selected.source,
          note: pair.selected.note,
        }
        compareQ = {
          byPro: pair.compare.byPro,
          salonRates: pair.compare.salonRates,
          truncated: pair.compare.truncated,
          source: pair.compare.source,
          note: pair.compare.note,
        }
        if (selectedQ.truncated || compareQ.truncated) {
          warnings.push('0011 local: amostra parcial (budget UI / páginas 0002)')
        }
        if (selectedQ.note) warnings.push(selectedQ.note)
        else if (compareQ.note) warnings.push(compareQ.note)
      } catch (e) {
        warnings.push(
          `0011 local: ${e instanceof Error ? e.message : String(e)}`,
        )
      }
    } else {
      const [selResult, cmpResult] = await Promise.allSettled([
        fetch0011Quarter(selectedQuarter, budget, professionals),
        fetch0011Quarter(compareQuarter, budget, professionals),
      ])
      if (selResult.status === 'fulfilled') {
        selectedQ = selResult.value
        if (selectedQ.truncated) warnings.push(`0011 ${selectedQuarter}: parcial (budget UI)`)
        if (selectedQ.note) warnings.push(selectedQ.note)
      } else
        warnings.push(
          `0011 ${selectedQuarter}: ${selResult.reason instanceof Error ? selResult.reason.message : String(selResult.reason)}`,
        )
      if (cmpResult.status === 'fulfilled') {
        compareQ = cmpResult.value
        if (compareQ.truncated) warnings.push(`0011 ${compareQuarter}: parcial (budget UI)`)
        if (compareQ.note && compareQ.note !== selectedQ.note) warnings.push(compareQ.note)
      } else
        warnings.push(
          `0011 ${compareQuarter}: ${cmpResult.reason instanceof Error ? cmpResult.reason.message : String(cmpResult.reason)}`,
        )
    }
  }

  const salonSel = avg(selectedQ.salonRates)
  const salonCmp = avg(compareQ.salonRates)

  // Indexa agregados 0011 por profissional do portfólio
  function indexByPro(src: Map<string, QuarterAgg>) {
    const out = new Map<string, QuarterAgg>()
    for (const [avecName, agg] of src) {
      if (avecName === '_unassigned') continue
      const pro = matchDirectorProfessional(avecName, professionals)
      if (!pro) continue
      const cur = out.get(pro.id) ?? {
        clients: [],
        returnRates: [],
        clientsTotalHint: 0,
        clientsReturnedHint: 0,
      }
      cur.clients.push(...agg.clients)
      cur.returnRates.push(...agg.returnRates)
      cur.clientsTotalHint = Math.max(cur.clientsTotalHint, agg.clientsTotalHint)
      cur.clientsReturnedHint = Math.max(cur.clientsReturnedHint, agg.clientsReturnedHint)
      out.set(pro.id, cur)
    }
    // Linhas sem profissional: distribui só se houver 1 pro filtrado
    const un = src.get('_unassigned')
    if (un && professionals.length === 1) {
      const only = professionals[0]!
      const cur = out.get(only.id) ?? {
        clients: [],
        returnRates: [],
        clientsTotalHint: 0,
        clientsReturnedHint: 0,
      }
      cur.clients.push(...un.clients)
      cur.returnRates.push(...un.returnRates)
      cur.clientsTotalHint = Math.max(cur.clientsTotalHint, un.clientsTotalHint)
      cur.clientsReturnedHint = Math.max(cur.clientsReturnedHint, un.clientsReturnedHint)
      out.set(only.id, cur)
    }
    return out
  }

  const selByPro = indexByPro(selectedQ.byPro)
  const cmpByPro = indexByPro(compareQ.byPro)

  // Se 0011 veio sem coluna profissional, atribui lista inteira a cada pro filtrado
  // só quando há um único profissional — senão fica no bloco com lista vazia + taxa salão.
  if (selByPro.size === 0 && selectedQ.byPro.size > 0) {
    const allClients: ReactivationClient[] = []
    const rates: number[] = []
    for (const agg of selectedQ.byPro.values()) {
      allClients.push(...agg.clients)
      rates.push(...agg.returnRates)
    }
    if (professionals.length === 1) {
      const un = selectedQ.byPro.get('_unassigned')
      selByPro.set(professionals[0]!.id, {
        clients: allClients,
        returnRates: rates,
        clientsTotalHint: un?.clientsTotalHint ?? 0,
        clientsReturnedHint: un?.clientsReturnedHint ?? 0,
      })
    }
  }

  let revenue_blocks: ProfessionalRevenueBlock[] | null = null
  if (want0021) {
    try {
      revenue_blocks = professionals.map((professional) => {
        const months: MonthRevenueRow[] = []
        for (const m of monthsNeeded) {
          const map = monthMaps.get(m)!
          let hit: { revenue: number; attended: number; ticketAvg: number } | undefined
          for (const [avecName, stats] of map) {
            const matched = matchDirectorProfessional(avecName, [professional])
            if (matched) {
              hit = stats
              break
            }
          }
          // Também tenta match contra lista completa (nome Avec → este pro)
          if (!hit) {
            for (const [avecName, stats] of map) {
              if (matchDirectorProfessional(avecName, professionals)?.id === professional.id) {
                hit = stats
                break
              }
            }
          }
          months.push(
            hit
              ? {
                  month: m,
                  label: labelMonth(m),
                  revenue: Math.round(hit.revenue),
                  ticket_avg: Math.round(hit.ticketAvg),
                  attended: hit.attended,
                }
              : emptyMonthRow(m),
          )
        }
        months.sort((a, b) => a.month.localeCompare(b.month))
        return {
          professional,
          months,
          quarters: aggregateQuarterRevenue(months),
          selected_month: selectedMonth,
        }
      })
    } catch (e) {
      warnings.push(`0021 falhou ao montar blocos: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  let return_blocks: ProfessionalReturnBlock[] | null = null
  if (want0011) {
    try {
      const hasPerPro = selByPro.size > 0 || cmpByPro.size > 0
      // Com breakdown por pro: só lista quem tem dado próprio (evita 59 linhas iguais).
      // Sem breakdown: um bloco "Salão" com a taxa 0007, se houver.
      const roster = hasPerPro
        ? professionals.filter((p) => selByPro.has(p.id) || cmpByPro.has(p.id))
        : salonSel != null || salonCmp != null
          ? [
              {
                id: 'pro-salon-0011',
                name: 'Salão (taxa Avec)',
                avec_pro_id: null,
                role: 'other' as const,
                active: true,
              },
            ]
          : professionals

      return_blocks = roster.map((professional) => {
        const selAgg = selByPro.get(professional.id)
        const cmpAgg = cmpByPro.get(professional.id)
        const useSalon = !hasPerPro

        // Com breakdown por pro: só taxa própria. Taxa do salão só na linha agregada.
        const cmpRow = buildQuarterRow(
          compareQuarter,
          cmpAgg,
          useSalon ? salonCmp : null,
          null,
          useSalon,
        )
        const selRow = buildQuarterRow(
          selectedQuarter,
          selAgg,
          useSalon ? salonSel : null,
          cmpRow.return_rate,
          useSalon,
        )

        if (selRow.return_rate != null && cmpRow.return_rate != null) {
          selRow.delta_vs_prev =
            Math.round((selRow.return_rate - cmpRow.return_rate) * 1000) / 10
        } else {
          selRow.delta_vs_prev = null
        }

        const reactivation = (selAgg?.clients ?? [])
          .slice()
          .sort((a, b) => b.days_since - a.days_since)

        return {
          professional,
          quarters: [cmpRow, selRow],
          selected_quarter: selectedQuarter,
          compare_quarter: compareQuarter,
          reactivation,
        }
      })
    } catch (e) {
      warnings.push(`0011 falhou ao montar blocos: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const hasAnyRevenue =
    revenue_blocks?.some((b) => b.months.some((m) => m.revenue > 0)) ?? false
  const hasAnyReturn =
    return_blocks != null &&
    (return_blocks.some((b) => b.reactivation.length > 0) ||
      return_blocks.some((b) =>
        b.quarters.some(
          (q) => (q.return_rate != null && q.return_rate > 0) || q.clients_total > 0,
        ),
      ))

  if (want0011 && want0021 && revenue_blocks == null && return_blocks == null) {
    throw new Error(
      `Avec 0011/0021 sem dados utilizáveis${warnings.length ? ` (${warnings.join('; ')})` : ''}`,
    )
  }
  if (want0011 && !want0021 && return_blocks == null) {
    throw new Error(
      `Avec 0011 sem dados utilizáveis${warnings.length ? ` (${warnings.join('; ')})` : ''}`,
    )
  }
  if (want0021 && !want0011 && revenue_blocks == null) {
    throw new Error(
      `Avec 0021 sem dados utilizáveis${warnings.length ? ` (${warnings.join('; ')})` : ''}`,
    )
  }

  if (want0021 && !hasAnyRevenue) {
    warnings.push('0021 sem faturamento casado aos profissionais do portfólio')
  }
  // Sem sinal útil: mantém blocos reais (vazios/zeros) — não nullar para forçar mock.
  if (want0011 && return_blocks != null && !hasAnyReturn) {
    warnings.push(
      '0011 sem lista/taxa no período — Avec 0011 pode estar indisponível neste salão; fallback 0007 sem dados',
    )
  }

  return { return_blocks, revenue_blocks, warnings }
}
