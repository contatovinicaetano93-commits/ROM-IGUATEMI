/**
 * Relatório 0011 a partir de salon_client_visits (sync 0002).
 * Preferido ao live quando a cobertura do trimestre não está truncada.
 */

import { getSql } from '@/lib/db'
import { aggregateLocal0011ByPro, previousQuarterKey } from './local-0011'
import type { Local0011Agg, Local0011QuarterResult } from './local-0011'
import { labelQuarter } from './period'
import { listDirectorReportProfessionals } from './professionals'
import type { DirectorProfessional, QuarterKey } from './types'

type DbVisitRow = {
  client_key: string
  visited_on: string
  client_name: string
  phone: string | null
  mobile: string | null
  email: string | null
  professional_names: string[] | null
}

export type VisitCoverage = {
  period_key: string
  row_count: number
  truncated: boolean
  synced_at: string
}

export function isVisitCoverageReady(cov: VisitCoverage | null | undefined): boolean {
  if (!cov) return false
  if (cov.truncated) return false
  return cov.row_count > 0
}

export async function getVisitCoverage(periodKey: QuarterKey): Promise<VisitCoverage | null> {
  try {
    const sql = getSql()
    const rows = (await sql`
      select period_key, row_count, truncated, synced_at::text as synced_at
      from salon_visit_sync_coverage
      where period_key = ${periodKey}
      limit 1
    `) as VisitCoverage[]
    return rows[0] ?? null
  } catch {
    return null
  }
}

/** Status operacional: cobertura de todos os trimestres já sincronizados. */
export async function listVisitCoverage(): Promise<{
  coverage: VisitCoverage[]
  visit_rows: number
}> {
  try {
    const sql = getSql()
    const coverage = (await sql`
      select period_key, row_count, truncated, synced_at::text as synced_at
      from salon_visit_sync_coverage
      order by period_key
    `) as VisitCoverage[]
    const cnt = (await sql`
      select count(*)::int as n from salon_client_visits
    `) as { n: number }[]
    return { coverage, visit_rows: cnt[0]?.n ?? 0 }
  } catch {
    return { coverage: [], visit_rows: 0 }
  }
}

async function loadQuarterClientsFromDb(quarter: QuarterKey): Promise<{
  clients: Parameters<typeof aggregateLocal0011ByPro>[0]
  truncated: boolean
}> {
  const sql = getSql()
  const cov = await getVisitCoverage(quarter)
  if (!isVisitCoverageReady(cov)) {
    return { clients: [], truncated: true }
  }

  const rows = (await sql`
    select
      client_key,
      visited_on::text as visited_on,
      client_name,
      phone,
      mobile,
      email,
      professional_names
    from salon_client_visits
    where source_report = '0002'
      and visited_on >= (select period_start from salon_visit_sync_coverage where period_key = ${quarter})
      and visited_on <= (select period_end from salon_visit_sync_coverage where period_key = ${quarter})
  `) as DbVisitRow[]

  const clients = rows.map((r) => ({
    key: r.client_key,
    name: r.client_name,
    email: r.email,
    phone: r.phone,
    mobile: r.mobile ?? r.phone,
    lastVisit: r.visited_on.slice(0, 10),
    proNames: Array.isArray(r.professional_names) ? r.professional_names : [],
  }))

  return { clients, truncated: false }
}

function buildFromDb(
  quarter: QuarterKey,
  prior: QuarterKey,
  p1: { clients: Parameters<typeof aggregateLocal0011ByPro>[0]; truncated: boolean },
  p2: { clients: Parameters<typeof aggregateLocal0011ByPro>[0]; truncated: boolean },
  professionals: DirectorProfessional[],
): Local0011QuarterResult {
  const byPro = aggregateLocal0011ByPro(
    p1.clients,
    p2.clients,
    professionals,
    undefined,
    { p2Truncated: p2.truncated },
  ) as Map<string, Local0011Agg>
  const truncated = p1.truncated || p2.truncated
  const hasData = byPro.size > 0
  const hasReliableRate = [...byPro.values()].some((a) => a.returnRates.length > 0)

  return {
    byPro,
    salonRates: [],
    truncated,
    source: hasData ? 'local' : 'none',
    note: !hasData
      ? `0011 DB sem cohort (${prior}→${quarter})`
      : hasReliableRate
        ? `0011 via banco interno 0002 (${labelQuarter(prior)}→${labelQuarter(quarter)})`
        : `0011 DB parcial — taxas omitidas`,
  }
}

/**
 * Monta par selected/compare a partir do DB.
 * null = cobertura insuficiente → caller usa Avec live.
 */
export async function tryFetch0011QuarterPairFromDb(
  selectedQuarter: QuarterKey,
  compareQuarter: QuarterKey,
  professionals: DirectorProfessional[],
): Promise<{
  selected: Local0011QuarterResult
  compare: Local0011QuarterResult
} | null> {
  if (professionals.length === 0) return null

  const selPrior = previousQuarterKey(selectedQuarter)
  const cmpPrior = previousQuarterKey(compareQuarter)
  const needed = [...new Set([selectedQuarter, selPrior, compareQuarter, cmpPrior])]

  const coverages = await Promise.all(needed.map((q) => getVisitCoverage(q)))
  if (!coverages.every((c) => isVisitCoverageReady(c))) return null

  try {
    const [selP1, selP2, cmpP1, cmpP2] = await Promise.all([
      loadQuarterClientsFromDb(selPrior),
      loadQuarterClientsFromDb(selectedQuarter),
      loadQuarterClientsFromDb(cmpPrior),
      loadQuarterClientsFromDb(compareQuarter),
    ])

    return {
      selected: buildFromDb(selectedQuarter, selPrior, selP1, selP2, professionals),
      compare: buildFromDb(compareQuarter, cmpPrior, cmpP1, cmpP2, professionals),
    }
  } catch {
    return null
  }
}

/** Probe ops: totais “Na lista” a partir do warehouse (sem Avec). */
export async function probe0011FromDb(
  selectedQuarter: QuarterKey,
  compareQuarter: QuarterKey,
): Promise<{
  ok: boolean
  missing_coverage: QuarterKey[]
  professionals: number
  selected: {
    quarter: QuarterKey
    note: string | null
    na_lista_soma_pros: number
    na_lista_unicos: number
    pros_com_lista: number
    taxa_media: number | null
    top: Array<{ pro: string; na_lista: number; taxa: number | null }>
  } | null
  compare: {
    quarter: QuarterKey
    note: string | null
    na_lista_soma_pros: number
    na_lista_unicos: number
  } | null
}> {
  const professionals = listDirectorReportProfessionals(true)
  const selPrior = previousQuarterKey(selectedQuarter)
  const cmpPrior = previousQuarterKey(compareQuarter)
  const needed = [...new Set([selectedQuarter, selPrior, compareQuarter, cmpPrior])]
  const coverages = await Promise.all(needed.map((q) => getVisitCoverage(q)))
  const missing = needed.filter((_, i) => !isVisitCoverageReady(coverages[i]))
  if (missing.length > 0) {
    return {
      ok: false,
      missing_coverage: missing,
      professionals: professionals.length,
      selected: null,
      compare: null,
    }
  }

  const pair = await tryFetch0011QuarterPairFromDb(
    selectedQuarter,
    compareQuarter,
    professionals,
  )
  if (!pair) {
    return {
      ok: false,
      missing_coverage: [],
      professionals: professionals.length,
      selected: null,
      compare: null,
    }
  }

  const summarize = (q: QuarterKey, result: Local0011QuarterResult) => {
    const unique = new Set<string>()
    let sum = 0
    const rates: number[] = []
    const top: Array<{ pro: string; na_lista: number; taxa: number | null }> = []
    for (const [pro, agg] of result.byPro) {
      const n = agg.clients.length
      sum += n
      for (const c of agg.clients) unique.add(`${c.name}|${c.phone ?? ''}|${c.email ?? ''}`)
      const taxa = agg.returnRates[0] ?? null
      if (taxa != null) rates.push(taxa)
      top.push({ pro, na_lista: n, taxa })
    }
    top.sort((a, b) => b.na_lista - a.na_lista)
    const taxa_media =
      rates.length > 0 ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 1000) / 1000 : null
    return {
      quarter: q,
      note: result.note,
      na_lista_soma_pros: sum,
      na_lista_unicos: unique.size,
      pros_com_lista: top.filter((t) => t.na_lista > 0).length,
      taxa_media,
      top: top.slice(0, 12),
    }
  }

  const selected = summarize(selectedQuarter, pair.selected)
  const compare = summarize(compareQuarter, pair.compare)

  return {
    ok: pair.selected.source === 'local' && pair.compare.source === 'local',
    missing_coverage: [],
    professionals: professionals.length,
    selected,
    compare: {
      quarter: compare.quarter,
      note: compare.note,
      na_lista_soma_pros: compare.na_lista_soma_pros,
      na_lista_unicos: compare.na_lista_unicos,
    },
  }
}
