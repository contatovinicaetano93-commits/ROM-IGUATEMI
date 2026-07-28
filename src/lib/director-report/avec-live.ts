import { fetchAllAvecReport, fmtAvecDate } from '@/lib/avec/client'
import {
  normalize0011ReactivationRow,
  normalizeP1ProfessionalRevenueRow,
  normalizeP3ReturnRateRow,
} from '@/lib/avec/normalize'
import { getAvecReportRegistry, resolveReportId } from '@/lib/avec/registry'
import { toSalonDateIso } from '@/lib/salon/format'
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

function resolveMapperId(mapper: string): string | null {
  const def = getAvecReportRegistry().find((r) => r.mapper === mapper)
  if (!def) return null
  return resolveReportId(def)
}

/** Intervalo dd/mm/yyyy do mês calendário (America/Sao_Paulo via YYYY-MM). */
export function monthRangeBr(month: MonthKey): { inicio: string; fim: string } {
  const [y, m] = month.split('-').map(Number)
  if (!y || !m) throw new Error(`Mês inválido: ${month}`)
  const start = new Date(y, m - 1, 1)
  const end = new Date(y, m, 0)
  return { inicio: fmtAvecDate(start), fim: fmtAvecDate(end) }
}

/** Intervalo dd/mm/yyyy do trimestre (YYYY-Qn). */
export function quarterRangeBr(quarter: QuarterKey): { inicio: string; fim: string } {
  const [yStr, qStr] = quarter.split('-Q')
  const y = Number(yStr)
  const q = Number(qStr) as 1 | 2 | 3 | 4
  if (!y || !q || q < 1 || q > 4) throw new Error(`Trimestre inválido: ${quarter}`)
  const startMonth = (q - 1) * 3
  const start = new Date(y, startMonth, 1)
  const end = new Date(y, startMonth + 3, 0)
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

async function fetch0021Month(
  month: MonthKey,
): Promise<Map<string, { revenue: number; attended: number; ticketAvg: number }>> {
  const id = resolveMapperId('professionals_revenue') ?? '0021'
  const { inicio, fim } = monthRangeBr(month)
  const { rows } = await fetchAllAvecReport(id, { inicio, fim, limit: 250 })
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
  maxPages?: number,
): Promise<{
  byPro: Map<string, QuarterAgg>
  salonRates: number[]
}> {
  const id = resolveMapperId('director_return') ?? '0011'
  const { inicio, fim } = quarterRangeBr(quarter)
  // UI/relatório: cap de páginas evita timeout (default Avec sync = 80 × 250 = 20k linhas).
  const { rows, truncated } = await fetchAllAvecReport(
    id,
    { inicio, fim, limit: 250 },
    maxPages ?? 40,
  )
  if (truncated) {
    console.warn(`[director-report] 0011 ${quarter} truncado em ${maxPages ?? 40} páginas`)
  }

  const byPro = new Map<string, QuarterAgg>()
  const salonRates: number[] = []

  for (const row of rows) {
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
    if (c.returnRate != null) agg.returnRates.push(c.returnRate)
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

  // Fallback: 0007 no mesmo período (taxa salão) se 0011 não trouxe taxa
  if (salonRates.length === 0) {
    const id0007 = resolveMapperId('return_rate')
    if (id0007) {
      try {
        const { rows: r7 } = await fetchAllAvecReport(id0007, { inicio, fim, limit: 250 })
        for (const row of r7) {
          const rate = normalizeP3ReturnRateRow(row)
          if (rate != null) salonRates.push(rate)
        }
      } catch {
        // opcional
      }
    }
  }

  return { byPro, salonRates }
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function buildQuarterRow(
  quarter: QuarterKey,
  agg: QuarterAgg | undefined,
  salonRate: number | null,
  prevRate: number | null,
): ReturnQuarterRow {
  const listN = agg?.clients.length ?? 0
  const rateFromAgg = avg(agg?.returnRates ?? [])
  // Lista 0011 = clientes sem retorno → taxa ≈ 1 − (lista / (lista + retornados)).
  // Sem total Avec, usamos taxa do relatório/0007; clients_total = tamanho da lista.
  const return_rate =
    rateFromAgg ??
    salonRate ??
    (listN > 0 ? 0 : 0)

  const clients_total = listN > 0 ? listN : agg?.clientsTotalHint || 0
  const clients_returned =
    clients_total > 0 && return_rate > 0
      ? Math.round(clients_total * return_rate)
      : agg?.clientsReturnedHint || 0

  return {
    quarter,
    label: labelQuarter(quarter),
    return_rate: Math.round(return_rate * 1000) / 1000,
    clients_total,
    clients_returned,
    delta_vs_prev:
      prevRate == null ? null : Math.round((return_rate - prevRate) * 1000) / 10,
  }
}

export interface LiveDirectorBlocks {
  /** null = etapa 0011 falhou ao montar (bug/exceção) — quem chama deve cair pro mock só dessa etapa. */
  return_blocks: ProfessionalReturnBlock[] | null
  /** null = etapa 0021 falhou ao montar (bug/exceção) — quem chama deve cair pro mock só dessa etapa. */
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
  opts?: { stages?: LiveDirectorStage; maxPages0011?: number },
): Promise<LiveDirectorBlocks> {
  const warnings: string[] = []
  const stages = opts?.stages ?? 'all'
  const want0011 = stages === '0011' || stages === 'all'
  const want0021 = stages === '0021' || stages === 'all'

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
          monthMaps.set(m, await fetch0021Month(m))
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
  }
  let compareQ: Awaited<ReturnType<typeof fetch0011Quarter>> = {
    byPro: new Map(),
    salonRates: [],
  }

  if (want0011) {
    const maxPages = opts?.maxPages0011
    const [selResult, cmpResult] = await Promise.allSettled([
      fetch0011Quarter(selectedQuarter, maxPages),
      fetch0011Quarter(compareQuarter, maxPages),
    ])
    if (selResult.status === 'fulfilled') selectedQ = selResult.value
    else
      warnings.push(
        `0011 ${selectedQuarter}: ${selResult.reason instanceof Error ? selResult.reason.message : String(selResult.reason)}`,
      )
    if (cmpResult.status === 'fulfilled') compareQ = cmpResult.value
    else
      warnings.push(
        `0011 ${compareQuarter}: ${cmpResult.reason instanceof Error ? cmpResult.reason.message : String(cmpResult.reason)}`,
      )
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
      selByPro.set(professionals[0]!.id, {
        clients: allClients,
        returnRates: rates,
        clientsTotalHint: 0,
        clientsReturnedHint: 0,
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
      return_blocks = professionals.map((professional) => {
        const selAgg = selByPro.get(professional.id)
        const cmpAgg = cmpByPro.get(professional.id)

        const cmpRow = buildQuarterRow(compareQuarter, cmpAgg, salonCmp, null)
        const selRow = buildQuarterRow(selectedQuarter, selAgg, salonSel, cmpRow.return_rate)

        // Se não há lista por pro mas há taxa salão, ainda mostra a taxa
        if (!selAgg && salonSel != null && selRow.clients_total === 0) {
          selRow.return_rate = Math.round(salonSel * 1000) / 1000
        }
        if (!cmpAgg && salonCmp != null && cmpRow.clients_total === 0) {
          cmpRow.return_rate = Math.round(salonCmp * 1000) / 1000
          selRow.delta_vs_prev =
            Math.round((selRow.return_rate - cmpRow.return_rate) * 1000) / 10
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
      return_blocks.some((b) => b.quarters.some((q) => q.return_rate > 0 || q.clients_total > 0)))

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

  /**
   * Roster 100% zerado NÃO é live útil (ex.: trimestre em aberto).
   * - `[]` = Avec respondeu, sem retorno/receita no período → UI honesta, sem mock.
   * - `null` = etapa falhou ao montar (exceção) → build cai no mock dessa etapa.
   */
  if (want0021 && revenue_blocks != null && !hasAnyRevenue) {
    warnings.push(
      '0021 sem faturamento casado aos profissionais do portfólio neste período',
    )
    revenue_blocks = []
  }
  if (want0011 && return_blocks != null && !hasAnyReturn) {
    warnings.push(
      '0011 sem lista/taxa no período — trimestre em aberto ou matching sem hit; use um trimestre já fechado',
    )
    return_blocks = []
  }

  return { return_blocks, revenue_blocks, warnings }
}
