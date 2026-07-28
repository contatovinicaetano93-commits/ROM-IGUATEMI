import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { computePeriodAnalytics } from '@/lib/salon/period-analytics'

export const maxDuration = 20

/** KPIs comerciais/operacionais do período — Visão analítica (não Financeiro). */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const url = new URL(req.url)
    const month = url.searchParams.get('month') ?? undefined
    const data = await computePeriodAnalytics({ month })

    if (!auth.session.can_view_revenue) {
      return ok({
        ...data,
        revenue: null,
        ticket_avg: null,
        lost_revenue: null,
        packages_revenue: null,
        packages: data.packages.map((p) => ({ ...p, revenue: null })),
        top_professionals: data.top_professionals.map((p) => ({ ...p, revenue: null })),
        top_services: data.top_services.map((s) => ({ ...s, revenue: null })),
        previous: {
          ...data.previous,
          revenue: null,
          ticket_avg: null,
        },
        can_view_revenue: false,
      })
    }

    return ok({ ...data, can_view_revenue: true })
  } catch (e) {
    return handleError(e)
  }
}
