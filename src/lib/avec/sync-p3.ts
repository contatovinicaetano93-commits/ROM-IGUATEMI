import { fetchAllAvecReport, periodRange, withRequiredAvecReportParams } from '@/lib/avec/client'
import {
  isP3NonReturnerRow,
  normalizeP3CurveRow,
  normalizeP3NewClientsRow,
  normalizeP3ReturnRateRow,
} from '@/lib/avec/normalize'
import { resolveReportId, getDailyReports } from '@/lib/avec/registry'
import { saveReportSnapshot } from '@/lib/avec/snapshots'
import { upsertSalonP3Daily } from '@/lib/salon/p3-metrics'
import { getSql } from '@/lib/db'

type SyncStatsLike = {
  snapshots_saved: number
  errors: string[]
  warnings?: string[]
  p3_rows?: number
}

function todayIsoLocal() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/**
 * Taxa de retorno local: cohort visitou nos 45d antes do mês de `asOf`
 * e retornou no mês até `asOf`.
 */
async function computeLocalReturnRate(asOfIso = todayIsoLocal()): Promise<number | null> {
  const sql = getSql()
  const rows = (await sql`
    with bounds as (
      select
        (date_trunc('month', ${asOfIso}::date)::date - 45) as p1_start,
        date_trunc('month', ${asOfIso}::date)::date as month_start,
        ${asOfIso}::date as as_of
    ),
    visited_p1 as (
      select distinct cs.contact_id
      from client_services cs, bounds b
      where cs.active = true
        and cs.last_done_at is not null
        and (cs.last_done_at at time zone 'America/Sao_Paulo')::date >= b.p1_start
        and (cs.last_done_at at time zone 'America/Sao_Paulo')::date < b.month_start
    ),
    returned as (
      select distinct cs.contact_id
      from client_services cs
      join visited_p1 v on v.contact_id = cs.contact_id
      cross join bounds b
      where cs.active = true
        and cs.last_done_at is not null
        and (cs.last_done_at at time zone 'America/Sao_Paulo')::date >= b.month_start
        and (cs.last_done_at at time zone 'America/Sao_Paulo')::date <= b.as_of
    )
    select
      (select count(*)::int from visited_p1) as cohort,
      (select count(*)::int from returned) as returned
  `) as { cohort: number; returned: number }[]
  const cohort = Number(rows[0]?.cohort ?? 0)
  const returned = Number(rows[0]?.returned ?? 0)
  if (cohort <= 0) return null
  return Math.round((returned / cohort) * 10000) / 10000
}

function clientMatchKey(row: Record<string, unknown>): string {
  const digits = String(row.celular ?? row.telefone ?? row.phone ?? '').replace(/\D/g, '')
  const phone = digits.length >= 10 ? digits.slice(-11) : digits
  if (phone.length >= 10) return `p:${phone}`
  const name = String(row.nome ?? row.cliente ?? row.name ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
  return name ? `n:${name}` : ''
}

/**
 * Fallback quando não há histórico local de last_done_at (ex.: Iguatemi pós-migração):
 * cohort = clientes únicos do 0002 no período 1; não-retorno = 0007 ∩ cohort.
 */
async function computeReturnRateFromAvec(
  nonReturnerRows: Record<string, unknown>[],
  reportParams: Record<string, unknown>,
  stats: SyncStatsLike,
  syncRunId?: string,
): Promise<number | null> {
  const inicio1 = String(reportParams.inicio1 ?? '')
  let fim1 = String(reportParams.fim1 ?? '')
  if (!inicio1 || !fim1) return null

  // Se fim1 = dia 1 do mês (início do P2), usa o dia anterior para não sobrepor.
  const [d, m, y] = fim1.split('/').map(Number)
  if (d === 1 && m && y) {
    const dt = new Date(Date.UTC(y, m - 1, d - 1))
    fim1 = `${String(dt.getUTCDate()).padStart(2, '0')}/${String(dt.getUTCMonth() + 1).padStart(2, '0')}/${dt.getUTCFullYear()}`
  }

  try {
    const cohortParams = withRequiredAvecReportParams('0002', {
      inicio: inicio1,
      fim: fim1,
      limit: 250,
      como_conheceu: '',
    })
    const cohortRows = asRows(await fetchAllAvecReport('0002', cohortParams))
    await snapshotSafe('0002', cohortParams, cohortRows, stats, syncRunId)

    const cohort = new Set<string>()
    for (const row of cohortRows) {
      const k = clientMatchKey(row)
      if (k) cohort.add(k)
    }
    if (cohort.size <= 0) return null

    const nonInCohort = new Set<string>()
    for (const row of nonReturnerRows) {
      if (!isP3NonReturnerRow(row)) continue
      const k = clientMatchKey(row)
      if (k && cohort.has(k)) nonInCohort.add(k)
    }
    const returned = Math.max(0, cohort.size - nonInCohort.size)
    return Math.round((returned / cohort.size) * 10000) / 10000
  } catch (e) {
    stats.warnings?.push(
      `P3 return_rate via 0002: ${e instanceof Error ? e.message : String(e)}`,
    )
    return null
  }
}

/**
 * Fallback ROM quando 0007/local falham: mix do mês em salon_month_metrics
 * (returning / (returning + new)). Melhor que null no Cérebro enquanto o JWT Avec renova.
 */
async function computeReturnRateFromMonthMetrics(): Promise<number | null> {
  const sql = getSql()
  try {
    const rows = (await sql`
      select
        coalesce(returning_clients, 0)::int as returning_clients,
        coalesce(new_clients, 0)::int as new_clients
      from salon_month_metrics
      where month = to_char(timezone('America/Sao_Paulo', now()), 'YYYY-MM')
      limit 1
    `) as { returning_clients: number; new_clients: number }[]
    const returning = Number(rows[0]?.returning_clients ?? 0)
    const neu = Number(rows[0]?.new_clients ?? 0)
    const denom = returning + neu
    if (denom <= 0 || returning <= 0) return null
    return Math.round((returning / denom) * 10000) / 10000
  } catch {
    return null
  }
}

function asRows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) {
    return result.every((item) => item && typeof item === 'object')
      ? (result as Record<string, unknown>[])
      : []
  }
  if (result && typeof result === 'object') {
    const rows = (result as { rows?: unknown }).rows
    if (Array.isArray(rows) && rows.every((item) => item && typeof item === 'object')) {
      return rows as Record<string, unknown>[]
    }
  }
  return []
}

async function snapshotSafe(
  reportId: string,
  params: Record<string, unknown>,
  rows: Record<string, unknown>[],
  stats: SyncStatsLike,
  syncRunId?: string,
) {
  try {
    await saveReportSnapshot(reportId, params, rows, syncRunId, { keepPayload: false, retain: 1 })
    stats.snapshots_saved++
  } catch (e) {
    stats.warnings?.push(`snapshot ${reportId}: ${e instanceof Error ? e.message : String(e)}`)
  }
}

function resolveId(mapper: string): string | null {
  const def = getDailyReports().find((r) => r.mapper === mapper)
  if (!def) return null
  return resolveReportId(def)
}

export type OpsPeriodOpts = {
  asOf?: string
  inicio?: string
  fim?: string
}

/**
 * P3 — sync full: 0007, 0088, 0017 → salon_p3_daily
 * Com `opts`, grava snapshot do período (mês) em `asOf`.
 */
export async function syncP3Kpis(stats: SyncStatsLike, syncRunId?: string, opts?: OpsPeriodOpts) {
  const day = opts?.asOf ?? todayIsoLocal()
  const rolling = periodRange(30, 0)
  const inicio = opts?.inicio ?? rolling.inicio
  const fim = opts?.fim ?? rolling.fim
  const params = { inicio, fim, limit: 250 }

  let return_rate = 0
  let returnRateOk = false
  const id0007 = resolveId('return_rate')
  if (id0007) {
    try {
      // Paridade Brasil: 0007 = mês corrente (+45d). NÃO passar rolling 30d.
      // Backfill mensal: só então usa inicio/fim do mês do snapshot.
      const reportParams =
        opts?.inicio && opts?.fim
          ? withRequiredAvecReportParams(id0007, {
              inicio: opts.inicio,
              fim: opts.fim,
              limit: 250,
            })
          : withRequiredAvecReportParams(id0007, { limit: 250 })
      const rows = asRows(await fetchAllAvecReport(id0007, reportParams))
      await snapshotSafe(id0007, reportParams, rows, stats, syncRunId)
      let sum = 0
      let n = 0
      let nonReturners = 0
      const nonReturnerRows: Record<string, unknown>[] = []
      for (const row of rows) {
        const r = normalizeP3ReturnRateRow(row)
        if (r != null) {
          stats.p3_rows = (stats.p3_rows ?? 0) + 1
          sum += r
          n++
          continue
        }
        if (isP3NonReturnerRow(row)) {
          nonReturners++
          nonReturnerRows.push(row)
        }
      }
      if (n > 0) {
        return_rate = Math.round((sum / n) * 10000) / 10000
        returnRateOk = true
      } else if (nonReturners > 0) {
        // Lista 0007 = sem retorno. Preferir cohort local; senão 0002 (P1) ∩ 0007; senão mix do mês.
        const local = await computeLocalReturnRate(day)
        const viaAvec =
          local == null
            ? await computeReturnRateFromAvec(nonReturnerRows, reportParams, stats, syncRunId)
            : null
        const viaMonth =
          local == null && viaAvec == null ? await computeReturnRateFromMonthMetrics() : null
        const rate = local ?? viaAvec ?? viaMonth
        if (rate != null) {
          return_rate = rate
          returnRateOk = true
          stats.p3_rows = (stats.p3_rows ?? 0) + nonReturners
          if (local == null && viaAvec != null) {
            stats.warnings?.push('P3 return_rate: usando cohort 0002 ∩ lista 0007')
          } else if (local == null && viaMonth != null) {
            stats.warnings?.push('P3 return_rate: usando mix returning/new do salon_month_metrics')
          }
        } else {
          stats.warnings?.push(
            `P3 0007: ${nonReturners} clientes sem retorno, sem taxa explícita — retorno indisponível`,
          )
        }
      }
    } catch (e) {
      stats.errors.push(`P3 0007: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // Fallback ROM se 0007 falhou/vazio
  if (!returnRateOk) {
    try {
      const local = await computeLocalReturnRate(day)
      const fromMonth = local == null ? await computeReturnRateFromMonthMetrics() : null
      const rate = local ?? fromMonth
      if (rate != null) {
        return_rate = rate
        returnRateOk = true
        stats.warnings?.push(
          local != null
            ? 'P3 return_rate: usando cálculo local (client_services)'
            : 'P3 return_rate: usando mix returning/new do salon_month_metrics',
        )
      }
    } catch (e) {
      stats.warnings?.push(`P3 return_rate local: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  let new_clients_period = 0
  let newClientsOk = false
  const id0017 = resolveId('new_clients_period')
  if (id0017) {
    try {
      const rows = asRows(await fetchAllAvecReport(id0017, params))
      await snapshotSafe(id0017, params, rows, stats, syncRunId)
      for (const row of rows) {
        const c = normalizeP3NewClientsRow(row)
        if (c == null) continue
        stats.p3_rows = (stats.p3_rows ?? 0) + 1
        new_clients_period += c
      }
      if (new_clients_period === 0 && rows.length > 0) {
        new_clients_period = rows.length
        stats.p3_rows = (stats.p3_rows ?? 0) + rows.length
      }
      newClientsOk = true
    } catch (e) {
      stats.errors.push(`P3 0017: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const revenue_curve: { day: string; revenue: number }[] = []
  let revenueCurveOk = false
  const id0088 = resolveId('revenue_curve')
  if (id0088) {
    try {
      const rows = asRows(await fetchAllAvecReport(id0088, params))
      await snapshotSafe(id0088, params, rows, stats, syncRunId)
      const byDay = new Map<string, number>()
      for (const row of rows) {
        const p = normalizeP3CurveRow(row)
        if (!p) continue
        stats.p3_rows = (stats.p3_rows ?? 0) + 1
        byDay.set(p.day, (byDay.get(p.day) ?? 0) + p.revenue)
      }
      for (const [d, revenue] of byDay) {
        revenue_curve.push({ day: d, revenue: Math.round(revenue) })
      }
      revenue_curve.sort((a, b) => a.day.localeCompare(b.day))
      revenueCurveOk = true
    } catch (e) {
      stats.errors.push(`P3 0088: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // Só escreve os campos cujo relatório teve sucesso — evita apagar dados
  // válidos do dia quando outro relatório falha parcialmente.
  // Nunca limpar return_rate para null (Cérebro exige return_rate > 0).
  const patch: {
    return_rate?: number
    new_clients_period?: number
    revenue_curve?: { day: string; revenue: number }[]
  } = {}
  if (returnRateOk) patch.return_rate = return_rate
  if (newClientsOk) patch.new_clients_period = new_clients_period
  if (revenueCurveOk) patch.revenue_curve = revenue_curve.slice(-30)

  if (Object.keys(patch).length > 0) {
    try {
      await upsertSalonP3Daily(day, patch)
    } catch (e) {
      stats.errors.push(`P3 upsert: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}
