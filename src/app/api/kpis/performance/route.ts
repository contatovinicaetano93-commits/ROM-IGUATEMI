import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { getLatestSalonP1Daily, getSalonP1DailyNear, type P1ProfessionalRow } from '@/lib/salon/p1-metrics'
import { compareByNamePtBr } from '@/lib/salon/sort'
import { todayIso } from '@/lib/salon/format'

function monthLastDay(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate()
  return `${monthKey}-${String(last).padStart(2, '0')}`
}

interface ProfessionalWithDelta extends P1ProfessionalRow {
  delta: { revenue: number | null; attended: number; occupancy: number | null } | null
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const url = new URL(req.url)
    const month = url.searchParams.get('month')?.trim() || null
    const today = todayIso()
    const currentMonth = today.slice(0, 7)

    let reference =
      month && /^\d{4}-\d{2}$/.test(month)
        ? await getSalonP1DailyNear(month === currentMonth ? today : monthLastDay(month))
        : await getLatestSalonP1Daily()

    if (!reference) {
      return ok({ reference_day: null, compare_day: null, professionals: [], month: month ?? null })
    }

    // Compara com o snapshot do mês anterior (fim do mês), não “−30 dias” genérico.
    const refMonth = reference.day.slice(0, 7)
    const [y, m] = refMonth.split('-').map(Number)
    const prevMonthDate = new Date(Date.UTC(y!, m! - 2, 1))
    const prevMonth = prevMonthDate.toISOString().slice(0, 7)
    const compare = await getSalonP1DailyNear(monthLastDay(prevMonth))
    const compareByName = new Map((compare?.professionals ?? []).map((p) => [p.name, p]))
    const canViewRevenue = auth.session.can_view_revenue

    const professionals: ProfessionalWithDelta[] = reference.professionals
      .map((p) => {
        const prev = compareByName.get(p.name)
        return {
          ...p,
          revenue: canViewRevenue ? p.revenue : (null as unknown as number),
          ticket_avg: canViewRevenue ? p.ticket_avg : (null as unknown as number),
          delta: prev
            ? {
                revenue: canViewRevenue ? p.revenue - prev.revenue : null,
                attended: p.attended - prev.attended,
                occupancy:
                  p.occupancy != null && prev.occupancy != null ? p.occupancy - prev.occupancy : null,
              }
            : null,
        }
      })
      .sort((a, b) =>
        canViewRevenue
          ? Number(b.revenue ?? 0) - Number(a.revenue ?? 0) || compareByNamePtBr(a.name, b.name)
          : b.attended - a.attended || compareByNamePtBr(a.name, b.name),
      )

    return ok({
      reference_day: reference.day,
      compare_day: compare && compare.day !== reference.day ? compare.day : null,
      month: month ?? refMonth,
      professionals,
      can_view_revenue: canViewRevenue,
    })
  } catch (e) {
    return handleError(e)
  }
}
