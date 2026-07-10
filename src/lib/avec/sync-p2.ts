import { fetchAllAvecReport, periodRange } from '@/lib/avec/client'
import {
  normalizeP2BirthdayRow,
  normalizeP2ChannelRow,
  normalizeP2PackageRow,
  normalizeP2RatingRow,
} from '@/lib/avec/normalize'
import { resolveReportId, getDailyReports } from '@/lib/avec/registry'
import { saveReportSnapshot } from '@/lib/avec/snapshots'
import { upsertSalonP2Daily } from '@/lib/salon/p2-metrics'

type SyncStatsLike = {
  snapshots_saved: number
  errors: string[]
  warnings?: string[]
  p2_rows?: number
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
 * C — sync full: 0056, 0061, 0104, 0001 → salon_p2_daily (sem 0081)
 */
export async function syncP2Kpis(stats: SyncStatsLike, syncRunId?: string) {
  const day = todayIsoLocal()
  const { inicio, fim } = periodRange(30, 0)
  const params = { inicio, fim, limit: 250 }

  const booking_channels: { channel: string; count: number }[] = []
  let bookingChannelsOk = false
  const id0056 = resolveId('booking_channels')
  if (id0056) {
    try {
      const rows = asRows(await fetchAllAvecReport(id0056, params))
      await snapshotSafe(id0056, params, rows, stats, syncRunId)
      for (const row of rows) {
        const c = normalizeP2ChannelRow(row)
        if (!c) continue
        stats.p2_rows = (stats.p2_rows ?? 0) + 1
        booking_channels.push(c)
      }
      booking_channels.sort((a, b) => b.count - a.count)
      bookingChannelsOk = true
    } catch (e) {
      stats.errors.push(`P2 0056: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const packages: { name: string; quantity: number; revenue: number }[] = []
  let packages_sold = 0
  let packagesOk = false
  const id0061 = resolveId('packages')
  if (id0061) {
    try {
      const rows = asRows(await fetchAllAvecReport(id0061, params))
      await snapshotSafe(id0061, params, rows, stats, syncRunId)
      for (const row of rows) {
        const p = normalizeP2PackageRow(row)
        if (!p) continue
        stats.p2_rows = (stats.p2_rows ?? 0) + 1
        packages.push({
          name: p.name,
          quantity: p.quantity,
          revenue: Math.round(p.revenue),
        })
        packages_sold += p.quantity
      }
      packages.sort((a, b) => b.revenue - a.revenue || b.quantity - a.quantity)
      packagesOk = true
    } catch (e) {
      stats.errors.push(`P2 0061: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  let ratings_avg = 0
  let ratings_count = 0
  let ratingsOk = false
  const id0104 = resolveId('ratings')
  if (id0104) {
    try {
      const rows = asRows(await fetchAllAvecReport(id0104, params))
      await snapshotSafe(id0104, params, rows, stats, syncRunId)
      let sum = 0
      let n = 0
      for (const row of rows) {
        const r = normalizeP2RatingRow(row)
        if (!r) continue
        stats.p2_rows = (stats.p2_rows ?? 0) + 1
        sum += r.score * Math.max(1, r.count)
        n += Math.max(1, r.count)
      }
      ratings_count = n
      ratings_avg = n > 0 ? Math.round((sum / n) * 100) / 100 : 0
      ratingsOk = true
    } catch (e) {
      stats.errors.push(`P2 0104: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  let birthday_count = 0
  let birthdaysOk = false
  const id0001 = resolveId('birthdays')
  if (id0001) {
    try {
      // Aniversariantes do mês corrente (sem período longo)
      const rows = asRows(await fetchAllAvecReport(id0001, { limit: 250 }))
      await snapshotSafe(id0001, { limit: 250 }, rows, stats, syncRunId)
      let counted = 0
      for (const row of rows) {
        if (normalizeP2BirthdayRow(row)) counted++
      }
      birthday_count = counted || rows.length
      stats.p2_rows = (stats.p2_rows ?? 0) + birthday_count
      birthdaysOk = true
    } catch (e) {
      stats.errors.push(`P2 0001: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // Só escreve os campos cujo relatório teve sucesso — evita apagar dados
  // válidos do dia quando outro relatório falha parcialmente.
  const patch: {
    booking_channels?: { channel: string; count: number }[]
    packages?: { name: string; quantity: number; revenue: number }[]
    packages_sold?: number
    ratings_avg?: number
    ratings_count?: number
    birthday_count?: number
  } = {}
  if (bookingChannelsOk) patch.booking_channels = booking_channels.slice(0, 8)
  if (packagesOk) {
    patch.packages = packages.slice(0, 8)
    patch.packages_sold = packages_sold
  }
  if (ratingsOk) {
    patch.ratings_avg = ratings_avg
    patch.ratings_count = ratings_count
  }
  if (birthdaysOk) patch.birthday_count = birthday_count

  if (Object.keys(patch).length > 0) {
    try {
      await upsertSalonP2Daily(day, patch)
    } catch (e) {
      stats.errors.push(`P2 upsert: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}
