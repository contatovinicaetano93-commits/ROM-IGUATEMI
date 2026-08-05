import { fetchAllAvecReport, fmtAvecDate, getAvecSyncMaxPages } from '@/lib/avec/client'
import {
  normalize0011ReactivationRow,
  normalizeP1ProfessionalRevenueRow,
  normalizeP3ReturnRateRow,
} from '@/lib/avec/normalize'
import { getAvecReportRegistry, resolveReportId } from '@/lib/avec/registry'
import { resolveMonthWindow } from '@/lib/salon/month-window'
import { tryFetch0011QuarterPairFromDb, tryFetch0021MonthFromDb } from './from-db'
import { fetchLocal0011Quarter, fetchLocal0011QuarterPair } from './local-0011'
import { matchDirectorProfessional } from './match-pro'
import {
  aggregateQuarterRevenue,
  labelMonth,
  labelQuarter,
  monthsInComparableQuarter,
} from './period'
import type {
  DirectorReport,
  DirectorProfessional,
  MonthKey,
  MonthRevenueRow,
  ProfessionalReturnBlock,
  ProfessionalRevenueBlock,
  QuarterKey,
  ReactivationClient,
  ReturnQuarterRow,
} from './types'

/**
 * BR usa Avec 0011 nativo por padrão.
 * Só pula quando AVEC_SKIP_REPORT_0011=1 (force local via env) — painel iguatemi
 * nunca aparece aqui, mas a env var serve de escape hatch caso o 0011 quebre.
 */
function shouldSkipAvec0011(): boolean {
  return (
    process.env.AVEC_SKIP_REPORT_0011 === '1' ||
    process.env.AVEC_SKIP_REPORT_0011 === 'true'
  )
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
    c.lastVisit ?? new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10)
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

/** Budget interativo: caber no abort 90s do browser + deixar margem de rede. */
export const DIRECTOR_UI_BUDGET_MS = 45_000
/** 20 × 250 = 5k linhas/trimestre — suficiente p/ taxa + lista; CSV completo usa budget completo. */
export const DIRECTOR_UI_MAX_PAGES = 8
/** Slim (UI rápida): menos páginas 0011 para caber na janela de 55s. */
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
  opts?: { warnings?: string[] },
): Promise<Map<string, { revenue: number; attended: number; ticketAvg: number }>> {
  const fromDb = await tryFetch0021MonthFromDb(month)
  if (fromDb) {
    opts?.warnings?.push(`0021 ${month} via banco interno`)
    return fromDb
  }

  const id = resolveMapperId('professionals_revenue') ?? '0021'
  const { inicio, fim } = monthRangeBr(month)
  const { rows } = await fetchAllAvecReport(
    id,
    { inicio, fim, limit: 250 },
    budget.maxPages,
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

type ReturnSource = NonNullable<DirectorReport['return_source']>
type QuarterReturnSource = 'db' | 'local' | 'avec' | 'none'

function combineReturnSources(
  selected: QuarterReturnSource,
  compare: QuarterReturnSource,
): ReturnSource {
  if (selected === 'none' && compare === 'none') return 'none'
  if (selected === 'db' && compare !== 'db') return 'mixed'
  if (selected !== 'none' && compare !== 'none' && selected !== compare) return 'mixed'
  if (selected !== 'none') return selected
  return compare
}

function sourceFromFetchedQuarter(source: '0011' | '0007' | 'local' | 'none'): QuarterReturnSource {
  if (source === '0011' || source === '0007') return 'avec'
  return source
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

  try {
    const result = await fetchAllAvecReport(
      id,
      { inicio, fim, limit: 250 },
      budget.maxPages,
      { deadlineAt: budget.deadlineAt },
    )
    truncated = result.truncated

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
    if (salonRates.length > 0 || byPro.size > 0) source = '0011'
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    note = `0011 indisponível (${msg.slice(0, 120)})`
    console.warn(`[director-report] 0011 ${quarter} falhou, tentando local:`, msg)
  }

  const hasRates = (): boolean =>
    salonRates.length > 0 ||
    [...byPro.values()].some(
      (a) =>
        a.returnRates.length > 0 ||
        (a.clientsTotalHint > 0 && a.clientsReturnedHint >= 0),
    )
  const hasClients = () => [...byPro.values()].some((a) => a.clients.length > 0)

  // Fallback local-0011:
  // - Avec falhou por completo, OU
  // - Avec trouxe só lista de não-retornados sem taxa (caso típico do Excel 0011).
  // Mantém listas Avec e só completa taxas/hints.
  if (!hasRates() && professionals.length > 0) {
    const timeLeft =
      budget.deadlineAt == null ? Number.POSITIVE_INFINITY : budget.deadlineAt - Date.now()
    // Precisa sobrar tempo p/ 0002 P1+P2; sem isso vários pros ficam sem taxa própria.
    if (timeLeft > 10_000) {
      try {
        const local = await fetchLocal0011Quarter(quarter, professionals, budget)
        truncated = truncated || local.truncated
        for (const rate of local.salonRates) salonRates.push(rate)
        for (const [proName, agg] of local.byPro) {
          const existing = byPro.get(proName)
          if (!existing) {
            byPro.set(proName, {
              clients: agg.clients,
              returnRates: [...agg.returnRates],
              clientsTotalHint: agg.clientsTotalHint,
              clientsReturnedHint: agg.clientsReturnedHint,
            })
            continue
          }
          if (existing.returnRates.length === 0 && agg.returnRates.length > 0) {
            existing.returnRates.push(...agg.returnRates)
          }
          if (existing.clientsTotalHint <= 0 && agg.clientsTotalHint > 0) {
            existing.clientsTotalHint = agg.clientsTotalHint
            existing.clientsReturnedHint = agg.clientsReturnedHint
          }
          if (existing.clients.length === 0 && agg.clients.length > 0) {
            existing.clients = agg.clients
          }
        }
        if (local.source === 'local') {
          if (!hasClients()) {
            source = 'local'
            note = local.note
          } else if (hasRates()) {
            note = note ?? '0011 Avec (lista) + taxa local 0002/0007'
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (!note) note = `0011 local falhou: ${msg.slice(0, 120)}`
        console.warn(`[director-report] local 0011 ${quarter}:`, msg)
      }
    }
  }

  // Fallback 0007: taxa do salão quando ainda não há evidência de taxa
  // (mesmo se a lista 0011 de clientes já veio — lista ≠ taxa).
  const timeLeft2 =
    budget.deadlineAt == null ? Number.POSITIVE_INFINITY : budget.deadlineAt - Date.now()
  if (!hasRates() && timeLeft2 > 8_000) {
    const id0007 = resolveMapperId('return_rate')
    if (id0007) {
      try {
        const { rows: r7 } = await fetchAllAvecReport(
          id0007,
          { inicio, fim, limit: 250 },
          Math.min(4, budget.maxPages),
          { deadlineAt: budget.deadlineAt },
        )
        for (const row of r7) {
          const rate = normalizeP3ReturnRateRow(row)
          if (rate != null) salonRates.push(rate)
        }
        if (salonRates.length > 0) {
          if (source === 'none') source = '0007'
          else note = note ?? '0011 lista + taxa 0007 do salão'
        }
      } catch {
        // opcional
      }
    }
  }

  return { byPro, salonRates, truncated, source, note }
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

/**
 * Taxa por profissional — só com evidência própria (taxa/cohort do pro).
 * Nunca clona a taxa do salão (0007) em cada linha: isso faz vários pros
 * aparecerem com a mesma % impossível de ser individual.
 * 100% com clientes p/ reativar > 0 → descarta (contaminado).
 * Sem evidência → null (UI "—").
 */
export function resolveDirectorReturnRate(opts: {
  returnRates: number[]
  nonReturnerCount: number
  salonRate: number | null
  clientsTotalHint?: number
  clientsReturnedHint?: number
  /** true só na linha agregada "Salão" — nunca em profissional de piso. */
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

  // Coluna “clientes p/ reativar” = tamanho da lista; senão hint de cohort.
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
  return_source: ReturnSource
  warnings: string[]
}

/**
 * Busca 0011 + 0021 na Avec e monta blocos do relatório.
 * Match por nome (e avec_pro_id quando preenchido).
 */
export async function fetchLiveDirectorBlocks(
  professionals: DirectorProfessional[],
  selectedMonth: MonthKey,
  selectedQuarter0021: QuarterKey,
  compareQuarter0021: QuarterKey | null,
  selectedQuarter: QuarterKey,
  compareQuarter: QuarterKey,
  opts?: {
    includeReturn?: boolean
    includeRevenue?: boolean
    /** Budget Avec — UI passa directorUiBudget(); cron/CSV usam full. */
    budget?: DirectorFetchBudget
  },
): Promise<LiveDirectorBlocks> {
  const includeReturn = opts?.includeReturn !== false
  const includeRevenue = opts?.includeRevenue !== false
  const budget = opts?.budget ?? directorFullBudget()
  const warnings: string[] = []
  let returnSource: ReturnSource = includeReturn ? 'none' : 'none'
  const monthsNeeded = new Set<MonthKey>()
  if (includeRevenue) {
    monthsNeeded.add(selectedMonth)
    if (compareQuarter0021) {
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
  }

  const monthMaps = new Map<
    MonthKey,
    Map<string, { revenue: number; attended: number; ticketAvg: number }>
  >()

  // Meses em paralelo (antes era 1 a 1 — 0021 no UI estourava o abort).
  if (monthsNeeded.size > 0) {
    const monthList = [...monthsNeeded]
    const settled = await Promise.allSettled(
      monthList.map((m) => fetch0021Month(m, budget, { warnings })),
    )
    settled.forEach((r, i) => {
      const m = monthList[i]!
      if (r.status === 'fulfilled') monthMaps.set(m, r.value)
      else {
        warnings.push(`0021 ${m}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`)
        monthMaps.set(m, new Map())
      }
    })
  }

  const emptyQ = {
    byPro: new Map<string, QuarterAgg>(),
    salonRates: [] as number[],
    truncated: false,
    source: 'none' as '0011' | '0007' | 'local' | 'none',
    note: null as string | null,
  }
  let selectedQ = { ...emptyQ }
  let compareQ = { ...emptyQ }

  if (includeReturn) {
    // 1) Banco interno (salon_client_visits) — rápido e estável quando o sync full cobriu os tris.
    let usedDb = false
    if (professionals.length > 0) {
      try {
        const fromDb = await tryFetch0011QuarterPairFromDb(
          selectedQuarter,
          compareQuarter,
          professionals,
        )
        if (fromDb && fromDb.selected.source === 'local') {
          selectedQ = {
            byPro: fromDb.selected.byPro,
            salonRates: fromDb.selected.salonRates,
            truncated: fromDb.selected.truncated,
            source: fromDb.selected.source,
            note: fromDb.selected.note,
          }
          compareQ = {
            byPro: fromDb.compare.byPro,
            salonRates: fromDb.compare.salonRates,
            truncated: fromDb.compare.truncated,
            source: fromDb.compare.source,
            note: fromDb.compare.note,
          }
          usedDb = true
          returnSource =
            fromDb.compare.source === 'local' ? 'db' : 'mixed'
          warnings.push('0011 via banco interno (proxy última visita 0002 sincronizado)')
          if (selectedQ.note) warnings.push(selectedQ.note)
          if (fromDb.compare.source !== 'local') {
            warnings.push(
              '0011 DB: comparativo sem cobertura completa — exibindo selecionado do banco',
            )
          }
          if (compareQ.note && compareQ.note !== selectedQ.note) {
            warnings.push(compareQ.note)
          }
        }
      } catch (e) {
        warnings.push(
          `0011 DB: ${e instanceof Error ? e.message : String(e)}`.slice(0, 160),
        )
      }
    }

    if (!usedDb && shouldSkipAvec0011() && professionals.length > 0) {
      // Skip: usa local-0011 pair (mais eficiente — compartilha 0002 do trimestre do meio).
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
        returnSource = combineReturnSources(
          selectedQ.source === 'local' ? 'local' : 'none',
          compareQ.source === 'local' ? 'local' : 'none',
        )
      } catch (e) {
        warnings.push(`0011 local: ${e instanceof Error ? e.message : String(e)}`)
      }
    } else if (!usedDb) {
      // Padrão: Avec 0011 (+ fallback local se falhar, + fallback 0007).
      const [selRes, cmpRes] = await Promise.allSettled([
        fetch0011Quarter(selectedQuarter, budget, professionals),
        fetch0011Quarter(compareQuarter, budget, professionals),
      ])
      if (selRes.status === 'fulfilled') {
        selectedQ = selRes.value
        if (selectedQ.truncated) warnings.push(`0011 ${selectedQuarter}: parcial (budget UI)`)
        if (selectedQ.note) warnings.push(selectedQ.note)
      } else {
        warnings.push(
          `0011 ${selectedQuarter}: ${selRes.reason instanceof Error ? selRes.reason.message : String(selRes.reason)}`,
        )
      }
      if (cmpRes.status === 'fulfilled') {
        compareQ = cmpRes.value
        if (compareQ.truncated) warnings.push(`0011 ${compareQuarter}: parcial (budget UI)`)
        if (compareQ.note && compareQ.note !== selectedQ.note) warnings.push(compareQ.note)
      } else {
        warnings.push(
          `0011 ${compareQuarter}: ${cmpRes.reason instanceof Error ? cmpRes.reason.message : String(cmpRes.reason)}`,
        )
      }
      returnSource = combineReturnSources(
        sourceFromFetchedQuarter(selectedQ.source),
        sourceFromFetchedQuarter(compareQ.source),
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

  const selByPro = includeReturn ? indexByPro(selectedQ.byPro) : new Map<string, QuarterAgg>()
  const cmpByPro = includeReturn ? indexByPro(compareQ.byPro) : new Map<string, QuarterAgg>()

  // Se 0011 veio sem coluna profissional, atribui lista inteira a cada pro filtrado
  // só quando há um único profissional — senão fica no bloco com lista vazia + taxa salão.
  if (includeReturn && selByPro.size === 0 && selectedQ.byPro.size > 0) {
    const allClients: ReactivationClient[] = []
    const rates: number[] = []
    for (const agg of selectedQ.byPro.values()) {
      allClients.push(...agg.clients)
      rates.push(...agg.returnRates)
    }
    if (professionals.length === 1) {
      selByPro.set(professionals[0]!.id, {
        clients: allClients,
        returnRates: rates,
        clientsTotalHint: 0,
        clientsReturnedHint: 0,
      })
    }
  }

  let revenue_blocks: ProfessionalRevenueBlock[] | null = null
  if (includeRevenue) {
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

  // UI mostra no máx. 3 listas; 1 pro filtrado = lista completa (até cap).
  const reactivationCap = professionals.length === 1 ? 200 : 40

  let return_blocks: ProfessionalReturnBlock[] | null = null
  if (includeReturn) {
    try {
      return_blocks = professionals.map((professional) => {
        const selAgg = selByPro.get(professional.id)
        const cmpAgg = cmpByPro.get(professional.id)

        // Taxa do salão NÃO entra por profissional (evita várias linhas com a mesma %).
        const cmpRow = buildQuarterRow(compareQuarter, cmpAgg, null, null)
        const selRow = buildQuarterRow(selectedQuarter, selAgg, null, cmpRow.return_rate)

        if (selRow.return_rate != null && cmpRow.return_rate != null) {
          selRow.delta_vs_prev =
            Math.round((selRow.return_rate - cmpRow.return_rate) * 1000) / 10
        } else {
          selRow.delta_vs_prev = null
        }

        const reactivation = (selAgg?.clients ?? [])
          .slice()
          .sort((a, b) => b.days_since - a.days_since)
          .slice(0, reactivationCap)

        return {
          professional,
          quarters: [cmpRow, selRow],
          selected_quarter: selectedQuarter,
          compare_quarter: compareQuarter,
          reactivation,
        }
      })

      const missingPersonalRate = return_blocks.some((b) =>
        b.quarters.some((q) => q.clients_total > 0 && q.return_rate == null),
      )
      if (missingPersonalRate && (salonSel != null || salonCmp != null)) {
        const pct = Math.round(((salonSel ?? salonCmp) as number) * 1000) / 10
        warnings.push(
          `Taxa do salão (~${pct}%) disponível via 0007, mas não é atribuída por profissional — só taxas individuais aparecem na tabela`,
        )
      }
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

  if (includeRevenue && includeReturn && revenue_blocks == null && return_blocks == null) {
    throw new Error(
      `Avec 0011/0021 sem dados utilizáveis${warnings.length ? ` (${warnings.join('; ')})` : ''}`,
    )
  }

  // Sem sinal útil: mantém blocos reais (zeros/vazios) — não nullar para forçar mock.
  if (includeRevenue && !hasAnyRevenue) {
    warnings.push('0021 sem faturamento casado aos profissionais do portfólio')
  }
  if (includeReturn && !hasAnyReturn) {
    warnings.push('0011 sem lista/taxa casada aos profissionais do portfólio')
  }

  return { return_blocks, revenue_blocks, return_source: returnSource, warnings }
}
