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
 * Taxa de retorno local: clientes com visita nos 45 dias antes do mês corrente
 * que também tiveram visita no mês corrente.
 */
async function computeLocalReturnRate(): Promise<number | null> {
  const sql = getSql()
  const rows = (await sql`
    with bounds as (
      select
        (date_trunc('month', timezone('America/Sao_Paulo', now()))::date - 45) as p1_start,
        (date_trunc('month', timezone('America/Sao_Paulo', now()))::date) as month_start,
        timezone('America/Sao_Paulo', now())::date as today
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
        and (cs.last_done_at at time zone 'America/Sao_Paulo')::date <= b.today
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
  const name = String(row.nome ?? row.cliente ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
  return name ? `n:${name}` : ''
}

/**
 * Fallback quando não há histórico local de last_done_at (ex.: pós-migração):
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

    let nonInCohort = 0
    for (const row of nonReturnerRows) {
      const k = clientMatchKey(row)
      if (k && cohort.has(k)) nonInCohort++
    }
    const returned = Math.max(0, cohort.size - nonInCohort)
    return Math.round((returned / cohort.size) * 10000) / 10000
  } catch (e) {
    stats.warnings?.push(
      `P3 return_rate via 0002: ${e instanceof Error ? e.message : String(e)}`,
    )
    return null
  }
}

function asRows(result: unknown): Record<string, unknown>[] {
  // Validate array items are objects before casting
  if (Array.isArray(result)) {
    return result.every((item) => item && typeof item === 'object') ? (result as Record<string, unknown>[]) : []
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
    await saveReportSnapshot(reportId, params, rows, syncRunId)
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

/**
 * P3 — sync full: 0007, 0088, 0017 → salon_p3_daily
 */
export async function syncP3Kpis(stats: SyncStatsLike, syncRunId?: string) {
  const day = todayIsoLocal()
  const { inicio, fim } = periodRange(30, 0)
  const params = { inicio, fim, limit: 250 }

  let return_rate = 0
  let returnRateOk = false
  const id0007 = resolveId('return_rate')
  if (id0007) {
    try {
      // 0007 exige inicio1/fim1/inicio2/fim2 (mês corrente + 45d antes) — não passar inicio/fim rolantes.
      const reportParams = withRequiredAvecReportParams(id0007, { limit: 250 })
      const rows = asRows(await fetchAllAvecReport(id0007, reportParams))
      await snapshotSafe(id0007, reportParams, rows, stats, syncRunId)
      let sum = 0
      let n = 0
      let nonReturners = 0
      for (const row of rows) {
        const r = normalizeP3ReturnRateRow(row)
        if (r != null) {
          stats.p3_rows = (stats.p3_rows ?? 0) + 1
          sum += r
          n++
          continue
        }
        if (isP3NonReturnerRow(row)) nonReturners++
      }
      if (n > 0) {
        return_rate = Math.round((sum / n) * 10000) / 10000
        returnRateOk = true
      } else if (nonReturners > 0) {
        // Lista 0007 = sem retorno. Preferir cohort local; senão 0002 (P1) ∩ 0007.
        const local = await computeLocalReturnRate()
        const viaAvec =
          local == null
            ? await computeReturnRateFromAvec(rows, reportParams, stats, syncRunId)
            : null
        const rate = local ?? viaAvec
        if (rate != null) {
          return_rate = rate
          returnRateOk = true
          stats.p3_rows = (stats.p3_rows ?? 0) + nonReturners
          if (local == null) {
            stats.warnings?.push('P3 return_rate: usando cohort 0002 ∩ lista 0007')
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
      const local = await computeLocalReturnRate()
      if (local != null) {
        return_rate = local
        returnRateOk = true
        stats.warnings?.push('P3 return_rate: usando cálculo local (client_services)')
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
      // Se o relatório for lista (1 linha = 1 cliente) e contagem veio 0, usa length
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
