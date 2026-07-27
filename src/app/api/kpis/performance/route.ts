import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { getLatestSalonP1Daily, getSalonP1DailyNear, type P1ProfessionalRow } from '@/lib/salon/p1-metrics'
import { compareByNamePtBr } from '@/lib/salon/sort'

function addDays(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

interface ProfessionalWithDelta extends P1ProfessionalRow {
  delta: { revenue: number | null; attended: number; occupancy: number | null } | null
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const latest = await getLatestSalonP1Daily()

    if (!latest) {
      return ok({ reference_day: null, compare_day: null, professionals: [] })
    }

    const compareTarget = addDays(latest.day, -30)
    const compare = await getSalonP1DailyNear(compareTarget)
    const compareByName = new Map((compare?.professionals ?? []).map((p) => [p.name, p]))
    const canViewRevenue = auth.session.can_view_revenue

    const professionals: ProfessionalWithDelta[] = latest.professionals
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
      // Ranking por faturamento (KPI); empate A–Z. Staff: ordena por atendidos.
      .sort((a, b) =>
        canViewRevenue
          ? Number(b.revenue ?? 0) - Number(a.revenue ?? 0) || compareByNamePtBr(a.name, b.name)
          : b.attended - a.attended || compareByNamePtBr(a.name, b.name),
      )

    return ok({
      reference_day: latest.day,
      compare_day: compare && compare.day !== latest.day ? compare.day : null,
      professionals,
      can_view_revenue: canViewRevenue,
    })
  } catch (e) {
    return handleError(e)
  }
}
