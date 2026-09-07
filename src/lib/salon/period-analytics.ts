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
import { resolveMonthWindow, resolvePreviousComparableWindow } from '@/lib/salon/month-window'

const MONTH_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

/** @deprecated use resolveMonthWindow — mantido para imports existentes. */
export function monthToDateRange(
  monthKey: string,
  referenceDay = todayIso(),
): { from: string; to: string } {
  const w = resolveMonthWindow(monthKey, referenceDay)
  return { from: w.from, to: w.to }
}

function labelMonthPt(monthKey: string): string {
  const [y, m] = monthKey.split('-')
  const idx = Number(m) - 1
  return `${MONTH_PT[idx] ?? m}/${y}`
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
): Promise<{ revenue: number | null; attended: number | null }> {
  const sql = getSql()
  try {
    const rows = (await sql`
      select
        sum(revenue)::float as revenue,
        count(revenue)::int as revenue_days,
        sum(attended)::float as attended,
        count(attended)::int as attended_days
      from salon_daily_metrics
      where day >= ${from}::date and day <= ${to}::date
    `) as {
      revenue: number | null
      revenue_days: number
      attended: number | null
      attended_days: number
    }[]
    const revenueDays = Number(rows[0]?.revenue_days ?? 0)
    const attendedDays = Number(rows[0]?.attended_days ?? 0)
    return {
      // Sem nenhum dia com receita conhecida → null (não inventar R$0 / MoM falso).
      revenue:
        revenueDays > 0 ? Math.round(Number(rows[0]?.revenue ?? 0) * 100) / 100 : null,
      attended: attendedDays > 0 ? Number(rows[0]?.attended ?? 0) || 0 : null,
    }
  } catch {
    return { revenue: null, attended: null }
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
  /** null = nenhum dia com receita conhecida no intervalo. */
  revenue: number | null
  /** null = nenhum dia com atendidos conhecidos no intervalo. */
  attended: number | null
  cancelled: number
  no_shows: number
  ticket_avg: number | null
  lost_revenue: number
  /** Ocupação média do snapshot P1 do fim da janela comparável (null se sem dados). */
  occupancy_avg: number | null
}

export interface PeriodAnalytics {
  month: string
  label: string
  from: string
  to: string
  /** Snapshot P1 day used for rankings / occupancy / acquisition. */
  snapshot_day: string | null
  /**
   * Soma de salon_daily_metrics no mês (acumulado ROM / Avec 0088).
   * null = nenhum dia com valor conhecido (ex.: dia 1 sem caixa Avec).
   */
  revenue: number | null
  attended: number | null
  /** true se a janela atual é MTD (mês corrente). */
  mtd: boolean
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
  new_clients_period: number | null
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
  const month = opts?.month ?? todayIso().slice(0, 7)
  const window = resolveMonthWindow(month)
  const { from, to } = window
  const prev = resolvePreviousComparableWindow(window)
  const [totals, loss, prevTotals, prevLoss, p1, p2, p3, prevP1] = await Promise.all([
    sumRevenueAndAttended(from, to),
    sumAttendanceLoss(from, to),
    sumRevenueAndAttended(prev.from, prev.to),
    sumAttendanceLoss(prev.from, prev.to),
    getSalonP1DailyNear(to),
    getSalonP2DailyNear(to),
    getSalonP3DailyNear(to),
    getSalonP1DailyNear(prev.to),
  ])
  const ticket_avg =
    totals.revenue != null && totals.attended != null && totals.attended > 0
      ? Math.round((totals.revenue / totals.attended) * 100) / 100
      : null
  const prev_ticket_avg =
    prevTotals.revenue != null && prevTotals.attended != null && prevTotals.attended > 0
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
    mtd: window.mtd,
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
    return_rate: p3?.return_rate ?? null,
    new_clients_period: p3?.new_clients_period ?? null,
    top_professionals: professionals.slice(0, 8),
    top_services: (p1?.services ?? []).slice(0, 8),
    previous: {
      month: prev.month,
      label: prev.label,
      revenue: prevTotals.revenue,
      attended: prevTotals.attended,
      cancelled: prevLoss.cancelled,
      no_shows: prevLoss.no_shows,
      ticket_avg: prev_ticket_avg,
      lost_revenue: estimateLostRevenue(prevLoss.cancelled, prevLoss.no_shows, prev_ticket_avg),
      occupancy_avg: averageOccupancy(prevP1?.professionals ?? []),
    },
  }
}
