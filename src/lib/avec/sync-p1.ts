import { fetchAllAvecReport, periodRange } from '@/lib/avec/client'
import {
  normalizeP1AcquisitionRow,
  normalizeP1OccupancyRow,
  normalizeP1ProfessionalRevenueRow,
  normalizeP1ServiceRow,
} from '@/lib/avec/normalize'
import { resolveReportId, getDailyReports } from '@/lib/avec/registry'
import { saveReportSnapshot } from '@/lib/avec/snapshots'
import { upsertSalonP1Daily, type P1ProfessionalRow } from '@/lib/salon/p1-metrics'

type SyncStatsLike = {
  snapshots_saved: number
  errors: string[]
  warnings?: string[]
  p1_rows?: number
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
 * P1 — sync diário (full): 0021, 0126, 0032, 0107, 0003 → salon_p1_daily
 * Não roda no fast (evita custo/API).
 */
export async function syncP1Kpis(stats: SyncStatsLike, syncRunId?: string) {
  const day = todayIsoLocal()
  const { inicio, fim } = periodRange(30, 0)
  const params = { inicio, fim, limit: 250 }

  // professionals é alimentado por DOIS relatórios independentes (0021 revenue +
  // 0126 ocupação) fundidos no mesmo registro por nome. Só marca ok quando os
  // relatórios CONFIGURADOS tiverem todos sucesso — senão um sucesso parcial
  // grava metade do registro (ex: revenue zerado) por cima do dado bom salvo antes.
  const byPro = new Map<string, P1ProfessionalRow>()
  let professionalsAttempted = false
  let professionalsFailed = false
  const id0021 = resolveId('professionals_revenue')
  if (id0021) {
    professionalsAttempted = true
    try {
      const rows = asRows(await fetchAllAvecReport(id0021, params))
      await snapshotSafe(id0021, params, rows, stats, syncRunId)
      for (const row of rows) {
        const p = normalizeP1ProfessionalRevenueRow(row)
        if (!p) continue
        stats.p1_rows = (stats.p1_rows ?? 0) + 1
        const cur = byPro.get(p.name) ?? {
          name: p.name,
          revenue: 0,
          attended: 0,
          ticket_avg: 0,
          occupancy: 0,
        }
        cur.revenue += p.revenue
        cur.attended += p.attended
        cur.ticket_avg = cur.attended > 0 ? cur.revenue / cur.attended : p.ticketAvg
        byPro.set(p.name, cur)
      }
    } catch (e) {
      professionalsFailed = true
      stats.errors.push(`P1 0021: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const id0126 = resolveId('professionals_occupancy')
  if (id0126) {
    professionalsAttempted = true
    try {
      const rows = asRows(await fetchAllAvecReport(id0126, params))
      await snapshotSafe(id0126, params, rows, stats, syncRunId)
      for (const row of rows) {
        const o = normalizeP1OccupancyRow(row)
        if (!o || o.occupancy == null) continue
        stats.p1_rows = (stats.p1_rows ?? 0) + 1
        const cur = byPro.get(o.name) ?? {
          name: o.name,
          revenue: 0,
          attended: 0,
          ticket_avg: 0,
          occupancy: 0,
        }
        cur.occupancy = o.occupancy
        byPro.set(o.name, cur)
      }
    } catch (e) {
      professionalsFailed = true
      stats.errors.push(`P1 0126: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const professionalsOk = professionalsAttempted && !professionalsFailed

  const professionals = Array.from(byPro.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)
    .map((p) => ({
      ...p,
      revenue: Math.round(p.revenue),
      ticket_avg: Math.round(p.ticket_avg),
    }))

  const services: { name: string; quantity: number; revenue: number }[] = []
  let servicesOk = false
  const id0032 = resolveId('top_services')
  if (id0032) {
    try {
      const rows = asRows(await fetchAllAvecReport(id0032, params))
      await snapshotSafe(id0032, params, rows, stats, syncRunId)
      for (const row of rows) {
        const s = normalizeP1ServiceRow(row)
        if (!s) continue
        stats.p1_rows = (stats.p1_rows ?? 0) + 1
        services.push({
          name: s.name,
          quantity: s.quantity,
          revenue: Math.round(s.revenue),
        })
      }
      services.sort((a, b) => b.revenue - a.revenue || b.quantity - a.quantity)
      servicesOk = true
    } catch (e) {
      stats.errors.push(`P1 0032: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const acquisition: { channel: string; clients: number }[] = []
  let acquisitionOk = false
  const id0003 = resolveId('acquisition')
  if (id0003) {
    try {
      const rows = asRows(await fetchAllAvecReport(id0003, params))
      await snapshotSafe(id0003, params, rows, stats, syncRunId)
      for (const row of rows) {
        const a = normalizeP1AcquisitionRow(row)
        if (!a) continue
        stats.p1_rows = (stats.p1_rows ?? 0) + 1
        acquisition.push(a)
      }
      acquisition.sort((a, b) => b.clients - a.clients)
      acquisitionOk = true
    } catch (e) {
      stats.errors.push(`P1 0003: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  let reactivation_count = 0
  let reactivationOk = false
  const id0107 = resolveId('reactivation')
  if (id0107) {
    try {
      const rows = asRows(await fetchAllAvecReport(id0107, { limit: 250 }))
      await snapshotSafe(id0107, { limit: 250 }, rows, stats, syncRunId)
      reactivation_count = rows.length
      stats.p1_rows = (stats.p1_rows ?? 0) + rows.length
      reactivationOk = true
    } catch (e) {
      stats.errors.push(`P1 0107: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // Só escreve os campos cujo relatório teve sucesso — evita apagar dados
  // válidos do dia quando outro relatório falha parcialmente.
  const patch: {
    professionals?: P1ProfessionalRow[]
    services?: { name: string; quantity: number; revenue: number }[]
    acquisition?: { channel: string; clients: number }[]
    reactivation_count?: number
  } = {}
  if (professionalsOk) patch.professionals = professionals
  if (servicesOk) patch.services = services.slice(0, 10)
  if (acquisitionOk) patch.acquisition = acquisition.slice(0, 8)
  if (reactivationOk) patch.reactivation_count = reactivation_count

  if (Object.keys(patch).length > 0) {
    try {
      await upsertSalonP1Daily(day, patch)
    } catch (e) {
      stats.errors.push(`P1 upsert: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}
