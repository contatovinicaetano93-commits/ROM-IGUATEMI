import { NextRequest } from 'next/server'
import { okCached, err, handleError } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { getLatestSalonP1Daily, getSalonP1DailyNear, type P1ProfessionalRow } from '@/lib/salon/p1-metrics'
import { compareByNamePtBr } from '@/lib/salon/sort'
import { todayIso } from '@/lib/salon/format'
import { ttlGetOrSet } from '@/lib/ttl-cache'

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
    const canViewRevenue = auth.session.can_view_revenue
    const cacheKey = `kpis:performance:${month ?? 'latest'}:rev=${canViewRevenue ? 1 : 0}`

    const payload = await ttlGetOrSet(cacheKey, 60_000, async () => {
      const reference =
        month && /^\d{4}-\d{2}$/.test(month)
          ? await getSalonP1DailyNear(month === currentMonth ? today : monthLastDay(month))
          : await getLatestSalonP1Daily()

      if (!reference) {
        return {
          reference_day: null as string | null,
          compare_day: null as string | null,
          professionals: [] as ProfessionalWithDelta[],
          month: month ?? null,
        }
      }

      const refMonth = reference.day.slice(0, 7)
      // Snapshot "near" pode ser de mês anterior — não rotular como o mês pedido.
      if (month && /^\d{4}-\d{2}$/.test(month) && refMonth !== month) {
        return {
          reference_day: null as string | null,
          compare_day: null as string | null,
          professionals: [] as ProfessionalWithDelta[],
          month,
        }
      }

      const [y, m] = refMonth.split('-').map(Number)
      const prevMonthDate = new Date(Date.UTC(y!, m! - 2, 1))
      const prevMonth = prevMonthDate.toISOString().slice(0, 7)
      const compare = await getSalonP1DailyNear(monthLastDay(prevMonth))
      const compareByName = new Map((compare?.professionals ?? []).map((p) => [p.name, p]))

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
                    p.occupancy != null && prev.occupancy != null
                      ? p.occupancy - prev.occupancy
                      : null,
                }
              : null,
          }
        })
        .sort((a, b) =>
          canViewRevenue
            ? Number(b.revenue ?? 0) - Number(a.revenue ?? 0) || compareByNamePtBr(a.name, b.name)
            : b.attended - a.attended || compareByNamePtBr(a.name, b.name),
        )

      return {
        reference_day: reference.day,
        compare_day: compare && compare.day !== reference.day ? compare.day : null,
        month: month ?? refMonth,
        professionals,
      }
    })

    return okCached({ ...payload, can_view_revenue: canViewRevenue }, 45)
  } catch (e) {
    return handleError(e)
  }
}
