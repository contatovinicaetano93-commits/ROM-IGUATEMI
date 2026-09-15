import 'server-only'

import { getSql } from '@/lib/db'
import { asJsonArray } from '@/lib/jsonb'
import { averageOccupancy } from '@/lib/salon/period-analytics'
import type { P1ProfessionalRow } from '@/lib/salon/p1-metrics'
import { todayIso } from '@/lib/salon/format'
import { buildWeekKpis, type WeekKpiTotals } from '@/lib/intranet/week-kpis'

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00`)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

export async function loadWeekKpis(): Promise<WeekKpiTotals & { from: string; to: string }> {
  const to = todayIso()
  const from = addDays(to, -6)
  const empty = { ...buildWeekKpis({ revenues: [], attended: [], occupancies: [] }), from, to }
  try {
    const sql = getSql()
    const metricRows = (await sql`
      select day::text as day, revenue, attended
      from salon_daily_metrics
      where day >= ${from}::date and day <= ${to}::date
      order by day
    `) as Array<{ day: string; revenue: number | null; attended: number | null }>

    const p1Rows = (await sql`
      select day::text as day, professionals
      from salon_p1_daily
      where day >= ${from}::date and day <= ${to}::date
      order by day
    `) as Array<{ day: string; professionals: unknown }>

    const occupancies = p1Rows.map((row) =>
      averageOccupancy(asJsonArray<P1ProfessionalRow>(row.professionals)),
    )
    const kpis = buildWeekKpis({
      revenues: metricRows.map((row) => (row.revenue == null ? null : Number(row.revenue))),
      attended: metricRows.map((row) => (row.attended == null ? null : Number(row.attended))),
      occupancies,
    })
    return { ...kpis, from, to }
  } catch {
    return empty
  }
}

export type { WeekKpiTotals }
