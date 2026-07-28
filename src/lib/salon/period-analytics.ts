import { getSql } from '@/lib/db'
import { todayIso } from '@/lib/salon/format'
import {
  getSalonP1DailyNear,
  type P1AcquisitionRow,
  type P1ProfessionalRow,
  type P1ServiceRow,
} from '@/lib/salon/p1-metrics'
import {
  getSalonP2DailyNear,
  type P2ChannelRow,
  type P2PackageRow,
} from '@/lib/salon/p2-metrics'
import { getSalonP3DailyNear } from '@/lib/salon/p3-metrics'

const MONTH_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function currentMonthKey(referenceDay: string): string {
  return referenceDay.slice(0, 7)
}

function monthRange(monthKey: string): { from: string; to: string } {
  const [y, m] = monthKey.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y!, m!, 0)).getUTCDate()
  return { from: `${monthKey}-01`, to: `${monthKey}-${String(lastDay).padStart(2, '0')}` }
}

/** Mês corrente: até hoje; meses fechados: 1º→último dia. */
export function monthToDateRange(
  monthKey: string,
  referenceDay = todayIso(),
): { from: string; to: string } {
  const range = monthRange(monthKey)
  return monthKey === currentMonthKey(referenceDay) ? { ...range, to: referenceDay } : range
}

function labelMonthPt(monthKey: string): string {
  const [y, m] = monthKey.split('-')
  const idx = Number(m) - 1
  return `${MONTH_PT[idx] ?? m}/${y}`
}

function previousMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  const d = new Date(Date.UTC(y!, m! - 1, 1))
  d.setUTCMonth(d.getUTCMonth() - 1)
  return d.toISOString().slice(0, 7)
}

/** Espelha o recorte MTD do mês atual no mês comparado (ex.: Jul 1–27 → Jun 1–27). */
function compareMonthToDateRange(
  currentMonth: string,
  compareMonth: string,
  referenceDay = todayIso(),
): { from: string; to: string } {
  const range = monthRange(compareMonth)
  if (currentMonth !== currentMonthKey(referenceDay)) return range
  const dayNum = Number(referenceDay.slice(8, 10))
  const last = Number(range.to.slice(8, 10))
  const capped = Math.min(dayNum, last)
  return { from: range.from, to: `${compareMonth}-${String(capped).padStart(2, '0')}` }
}

/**
 * Coerce ocupação para fração (≥0), sem clipar overbooking.
 * Snapshot já vem de parsePct (0.8 / 1.063); só corrige legado em pontos (ex.: 67.79).
 */
export function coerceOccupancyFraction(raw: number): number | null {
  if (!Number.isFinite(raw) || raw < 0) return null
  return raw > 2 ? raw / 100 : raw
}

/** Média de ocupação 0–1+ a partir do 0126 (ponderada por atendidos). */
export function averageOccupancy(professionals: P1ProfessionalRow[]): number | null {
  if (!professionals.length) return null
  let weighted = 0
  let weight = 0
  let simple = 0
  let count = 0
  for (const p of professionals) {
    if (p.occupancy == null) continue
    const occ = coerceOccupancyFraction(Number(p.occupancy))
    if (occ == null) continue
    simple += occ
    count += 1
    const w = Math.max(0, Number(p.attended) || 0)
    if (w > 0) {
      weighted += occ * w
      weight += w
    }
  }
  if (count === 0) return null
  const avg = weight > 0 ? weighted / weight : simple / count
  return Math.round(avg * 1000) / 1000
}

/** Receita perdida estimada: (cancelados + no-shows) × ticket médio. */
export function estimateLostRevenue(
  cancelled: number,
  noShows: number,
  ticketAvg: number | null,
): number {
  if (ticketAvg == null || !(ticketAvg > 0)) return 0
  const lost = (Math.max(0, cancelled) + Math.max(0, noShows)) * ticketAvg
  return Math.round(lost * 100) / 100
}

async function sumRevenueAndAttended(
  from: string,
  to: string,
): Promise<{ revenue: number; attended: number }> {
  const sql = getSql()
  try {
    const rows = (await sql`
      select
        coalesce(sum(revenue), 0)::float as revenue,
        coalesce(sum(attended), 0)::int as attended
      from salon_daily_metrics
      where day >= ${from}::date and day <= ${to}::date
    `) as { revenue: number; attended: number }[]
    return {
      revenue: Math.round(Number(rows[0]?.revenue ?? 0) * 100) / 100,
      attended: Number(rows[0]?.attended ?? 0) || 0,
    }
  } catch {
    return { revenue: 0, attended: 0 }
  }
}

async function sumAttendanceLoss(
  from: string,
  to: string,
): Promise<{ cancelled: number; no_shows: number }> {
  const sql = getSql()
  try {
    const rows = (await sql`
      select
        coalesce(sum(cancelled), 0)::int as cancelled,
        coalesce(sum(no_shows), 0)::int as no_shows
      from salon_daily_metrics
      where day >= ${from}::date and day <= ${to}::date
    `) as { cancelled: number; no_shows: number }[]
    return {
      cancelled: Number(rows[0]?.cancelled ?? 0) || 0,
      no_shows: Number(rows[0]?.no_shows ?? 0) || 0,
    }
  } catch {
    return { cancelled: 0, no_shows: 0 }
  }
}

export interface PeriodCompareBucket {
  month: string
  label: string
  revenue: number
  attended: number
  cancelled: number
  no_shows: number
  ticket_avg: number | null
}

export interface PeriodAnalytics {
  month: string
  label: string
  from: string
  to: string
  /** Snapshot P1 day used for rankings / occupancy / acquisition. */
  snapshot_day: string | null
  /** Soma de salon_daily_metrics no mês (acumulado ROM / Avec 0088). */
  revenue: number
  attended: number
  occupancy_avg: number | null
  cancelled: number
  no_shows: number
  ticket_avg: number | null
  lost_revenue: number
  packages: P2PackageRow[]
  packages_sold: number
  packages_revenue: number
  booking_channels: P2ChannelRow[]
  acquisition: P1AcquisitionRow[]
  return_rate: number | null
  new_clients_period: number
  top_professionals: P1ProfessionalRow[]
  top_services: P1ServiceRow[]
  /** Mês anterior (mesmo recorte MTD quando aplicável) — comparativo na Visão. */
  previous: PeriodCompareBucket
}

/**
 * Analytics comercial/operacional do período (Visão analítica).
 * Usa snapshots Avec P1/P2/P3 + métricas diárias — não é extrato financeiro.
 */
export async function computePeriodAnalytics(opts?: {
  month?: string
}): Promise<PeriodAnalytics> {
  const month = opts?.month ?? currentMonthKey(todayIso())
  const { from, to } = monthToDateRange(month)
  const prevMonth = previousMonthKey(month)
  const prevRange = compareMonthToDateRange(month, prevMonth)
  const [totals, loss, prevTotals, prevLoss, p1, p2, p3] = await Promise.all([
    sumRevenueAndAttended(from, to),
    sumAttendanceLoss(from, to),
    sumRevenueAndAttended(prevRange.from, prevRange.to),
    sumAttendanceLoss(prevRange.from, prevRange.to),
    getSalonP1DailyNear(to),
    getSalonP2DailyNear(to),
    getSalonP3DailyNear(to),
  ])
  const ticket_avg =
    totals.attended > 0 ? Math.round((totals.revenue / totals.attended) * 100) / 100 : null
  const prev_ticket_avg =
    prevTotals.attended > 0
      ? Math.round((prevTotals.revenue / prevTotals.attended) * 100) / 100
      : null
  const professionals = p1?.professionals ?? []
  const allPackages = p2?.packages ?? []
  const packages_revenue =
    Math.round(allPackages.reduce((s, p) => s + Number(p.revenue || 0), 0) * 100) / 100

  return {
    month,
    label: labelMonthPt(month),
    from,
    to,
    snapshot_day: p1?.day ?? p2?.day ?? p3?.day ?? null,
    revenue: totals.revenue,
    attended: totals.attended,
    occupancy_avg: averageOccupancy(professionals),
    cancelled: loss.cancelled,
    no_shows: loss.no_shows,
    ticket_avg,
    lost_revenue: estimateLostRevenue(loss.cancelled, loss.no_shows, ticket_avg),
    packages: allPackages.slice(0, 10),
    packages_sold: Number(p2?.packages_sold ?? 0) || 0,
    packages_revenue,
    booking_channels: (p2?.booking_channels ?? []).slice(0, 10),
    acquisition: (p1?.acquisition ?? []).slice(0, 10),
    return_rate: p3 != null ? Number(p3.return_rate) : null,
    new_clients_period: Number(p3?.new_clients_period ?? 0) || 0,
    top_professionals: professionals.slice(0, 8),
    top_services: (p1?.services ?? []).slice(0, 8),
    previous: {
      month: prevMonth,
      label: labelMonthPt(prevMonth),
      revenue: prevTotals.revenue,
      attended: prevTotals.attended,
      cancelled: prevLoss.cancelled,
      no_shows: prevLoss.no_shows,
      ticket_avg: prev_ticket_avg,
    },
  }
}
