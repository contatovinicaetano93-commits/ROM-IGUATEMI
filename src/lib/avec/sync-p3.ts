import { fetchAllAvecReport, periodRange } from '@/lib/avec/client'
import {
  normalizeP3CurveRow,
  normalizeP3NewClientsRow,
  normalizeP3ReturnRateRow,
} from '@/lib/avec/normalize'
import { resolveReportId, getDailyReports } from '@/lib/avec/registry'
import { saveReportSnapshot } from '@/lib/avec/snapshots'
import { upsertSalonP3Daily } from '@/lib/salon/p3-metrics'

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

function asRows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[]
  if (result && typeof result === 'object' && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: Record<string, unknown>[] }).rows
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
      const rows = asRows(await fetchAllAvecReport(id0007, params))
      await snapshotSafe(id0007, params, rows, stats, syncRunId)
      // Preferência: média ponderada se várias linhas; senão primeira taxa válida
      let sum = 0
      let n = 0
      for (const row of rows) {
        const r = normalizeP3ReturnRateRow(row)
        if (r == null) continue
        stats.p3_rows = (stats.p3_rows ?? 0) + 1
        sum += r
        n++
      }
      if (n > 0) return_rate = Math.round((sum / n) * 10000) / 10000
      returnRateOk = true
    } catch (e) {
      stats.errors.push(`P3 0007: ${e instanceof Error ? e.message : String(e)}`)
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
