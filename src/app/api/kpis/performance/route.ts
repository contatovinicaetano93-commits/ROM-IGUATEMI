import { ok, handleError } from '@/lib/api-response'
import { getLatestSalonP1Daily, getSalonP1DailyNear, type P1ProfessionalRow } from '@/lib/salon/p1-metrics'
import { compareByNamePtBr } from '@/lib/salon/sort'

function addDays(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

interface ProfessionalWithDelta extends P1ProfessionalRow {
  delta: { revenue: number; attended: number; occupancy: number | null } | null
}

export async function GET() {
  try {
    const latest = await getLatestSalonP1Daily()

    if (!latest) {
      return ok({ reference_day: null, compare_day: null, professionals: [] })
    }

    const compareTarget = addDays(latest.day, -30)
    const compare = await getSalonP1DailyNear(compareTarget)
    const compareByName = new Map((compare?.professionals ?? []).map((p) => [p.name, p]))

    const professionals: ProfessionalWithDelta[] = latest.professionals
      .map((p) => {
        const prev = compareByName.get(p.name)
        return {
          ...p,
          delta: prev
            ? {
                revenue: p.revenue - prev.revenue,
                attended: p.attended - prev.attended,
                occupancy:
                  p.occupancy != null && prev.occupancy != null ? p.occupancy - prev.occupancy : null,
              }
            : null,
        }
      })
      // Ranking por faturamento (KPI); empate A–Z
      .sort((a, b) => b.revenue - a.revenue || compareByNamePtBr(a.name, b.name))

    return ok({
      reference_day: latest.day,
      compare_day: compare && compare.day !== latest.day ? compare.day : null,
      professionals,
    })
  } catch (e) {
    return handleError(e)
  }
}
