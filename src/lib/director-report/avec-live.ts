import { fetchAllAvecReport, fmtAvecDate } from '@/lib/avec/client'
import {
  normalize0011ReactivationRow,
  normalizeP1ProfessionalRevenueRow,
  normalizeP3ReturnRateRow,
} from '@/lib/avec/normalize'
import { getAvecReportRegistry, resolveReportId } from '@/lib/avec/registry'
import { matchDirectorProfessional } from './match-pro'
import { labelMonth, labelQuarter } from './period'
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

type QuarterAgg = {
  clients: ReactivationClient[]
  returnRates: number[]
  clientsTotalHint: number
  clientsReturnedHint: number
}

async function fetch0011Quarter(quarter: QuarterKey): Promise<{
  byPro: Map<string, QuarterAgg>
  salonRates: number[]
}> {
  const id = resolveMapperId('director_return') ?? '0011'
  const { inicio, fim } = quarterRangeBr(quarter)
  const { rows } = await fetchAllAvecReport(id, { inicio, fim, limit: 250 })

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
  return_blocks: ProfessionalReturnBlock[]
  revenue_blocks: ProfessionalRevenueBlock[]
  warnings: string[]
}

/**
 * Busca 0011 + 0021 na Avec e monta blocos do relatório.
 * Match por nome (e avec_pro_id quando preenchido).
 */
export async function fetchLiveDirectorBlocks(
  professionals: DirectorProfessional[],
  selectedMonth: MonthKey,
  compareMonth: MonthKey | null,
  selectedQuarter: QuarterKey,
  compareQuarter: QuarterKey,
): Promise<LiveDirectorBlocks> {
  const warnings: string[] = []
  const monthsNeeded = new Set<MonthKey>([selectedMonth])
  if (compareMonth) monthsNeeded.add(compareMonth)

  const monthMaps = new Map<
    MonthKey,
    Map<string, { revenue: number; attended: number; ticketAvg: number }>
  >()

  for (const m of monthsNeeded) {
    try {
      monthMaps.set(m, await fetch0021Month(m))
    } catch (e) {
      warnings.push(`0021 ${m}: ${e instanceof Error ? e.message : String(e)}`)
      monthMaps.set(m, new Map())
    }
  }

  let selectedQ: Awaited<ReturnType<typeof fetch0011Quarter>>
  let compareQ: Awaited<ReturnType<typeof fetch0011Quarter>>
  try {
    selectedQ = await fetch0011Quarter(selectedQuarter)
  } catch (e) {
    warnings.push(`0011 ${selectedQuarter}: ${e instanceof Error ? e.message : String(e)}`)
    selectedQ = { byPro: new Map(), salonRates: [] }
  }
  try {
    compareQ = await fetch0011Quarter(compareQuarter)
  } catch (e) {
    warnings.push(`0011 ${compareQuarter}: ${e instanceof Error ? e.message : String(e)}`)
    compareQ = { byPro: new Map(), salonRates: [] }
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

  const revenue_blocks: ProfessionalRevenueBlock[] = professionals.map((professional) => {
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
    return { professional, months, selected_month: selectedMonth }
  })

  const return_blocks: ProfessionalReturnBlock[] = professionals.map((professional) => {
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

  const hasAnyRevenue = revenue_blocks.some((b) => b.months.some((m) => m.revenue > 0))
  const hasAnyReturn =
    return_blocks.some((b) => b.reactivation.length > 0) ||
    return_blocks.some((b) => b.quarters.some((q) => q.return_rate > 0 || q.clients_total > 0))

  if (!hasAnyRevenue && !hasAnyReturn) {
    throw new Error(
      `Avec 0011/0021 sem dados utilizáveis${warnings.length ? ` (${warnings.join('; ')})` : ''}`,
    )
  }

  if (!hasAnyRevenue) warnings.push('0021 sem faturamento casado aos profissionais do portfólio')
  if (!hasAnyReturn) warnings.push('0011 sem lista/taxa casada aos profissionais do portfólio')

  return { return_blocks, revenue_blocks, warnings }
}
