import { ok, handleError } from '@/lib/api-response'
import { computePeriodAnalytics } from '@/lib/salon/period-analytics'

/** KPIs comerciais/operacionais do período — Visão analítica (não Financeiro). */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const month = url.searchParams.get('month') ?? undefined
    const data = await computePeriodAnalytics({ month })
    return ok(data)
  } catch (e) {
    return handleError(e)
  }
}
