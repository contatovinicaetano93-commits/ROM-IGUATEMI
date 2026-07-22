import { fetchAllAvecReport, periodRange } from '@/lib/avec/client'
import {
  normalizeP2BirthdayRow,
  normalizeP2ChannelRow,
  normalizeP2PackageRow,
  normalizeP2PaymentRow,
  normalizeP2RatingRow,
} from '@/lib/avec/normalize'
import { resolveReportId, getDailyReports } from '@/lib/avec/registry'
import { saveReportSnapshot } from '@/lib/avec/snapshots'
import { upsertSalonP2Daily, type P2PaymentRow } from '@/lib/salon/p2-metrics'
import { avecSiteParam } from '@/lib/brand'

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

function addCalendarDays(isoYmd: string, delta: number) {
  const [y, m, d] = isoYmd.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, m! - 1, d! + delta))
  return dt.toISOString().slice(0, 10)
}

function isoToBr(isoYmd: string) {
  const [y, m, d] = isoYmd.split('-')
  return `${d}/${m}/${y}`
}

function listDaysInclusive(fromIso: string, toIso: string): string[] {
  const out: string[] = []
  let cur = fromIso
  while (cur <= toIso) {
    out.push(cur)
    cur = addCalendarDays(cur, 1)
  }
  return out
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

function aggregatePaymentMix(rows: Record<string, unknown>[]): P2PaymentRow[] {
  const totals = new Map<string, number>()
  for (const row of rows) {
    const p = normalizeP2PaymentRow(row)
    if (!p) continue
    totals.set(p.method, (totals.get(p.method) ?? 0) + p.amount)
  }
  const total = [...totals.values()].reduce((a, b) => a + b, 0)
  return [...totals.entries()]
    .map(([method, amount]) => ({
      method,
      amount: Math.round(amount * 100) / 100,
      share: total > 0 ? Math.round((amount / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.amount - a.amount)
}

/**
 * Sync 0081 (formas de pagamento) dia a dia.
 * Fast: só hoje. Full (via syncP2): últimos `daysBack` dias + hoje.
 */
export async function syncPaymentMixRecent(
  stats: SyncStatsLike,
  syncRunId?: string,
  daysBack = 0,
) {
  const id0081 = resolveId('payment_mix') ?? '0081'
  const today = todayIsoLocal()
  const from = addCalendarDays(today, -Math.max(0, daysBack))
  const days = listDaysInclusive(from, today)

  for (const day of days) {
    const params = {
      inicio: isoToBr(day),
      fim: isoToBr(day),
      site: avecSiteParam(),
      limit: 250,
    }
    try {
      const rows = asRows(await fetchAllAvecReport(id0081, params))
      await snapshotSafe(id0081, params, rows, stats, syncRunId)
      const payment_mix = aggregatePaymentMix(rows)
      stats.p2_rows = (stats.p2_rows ?? 0) + payment_mix.length
      await upsertSalonP2Daily(day, { payment_mix })
    } catch (e) {
      stats.errors.push(`P2 0081 ${day}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}

/**
 * C — sync full: 0056, 0061, 0104, 0001, 0081 → salon_p2_daily
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

  // 0081: últimos 7 dias (full) — dia a dia para o Financeiro somar o mês sem double-count.
  await syncPaymentMixRecent(stats, syncRunId, 7)
}
