import { NextRequest } from 'next/server'
import { okCached, err, handleError } from '@/lib/api-response'
import { requireDashboard } from '@/lib/auth'
import { ttlGetOrSet } from '@/lib/ttl-cache'
import { computeDailyPerformanceIndex } from '@/lib/salon/daily-performance-index'
import { todayIso } from '@/lib/salon/format'

export const maxDuration = 60

/** Índice de Performance Diária — constância (dias veio ÷ dias úteis) vs média do salão. */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireDashboard(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const monthRaw = req.nextUrl.searchParams.get('month')?.trim()
    const month = monthRaw && /^\d{4}-\d{2}$/.test(monthRaw) ? monthRaw : null

    const data = await ttlGetOrSet(
      `kpis:indice-performance:v4:${month ?? 'latest'}`,
      45_000,
      async () =>
        computeDailyPerformanceIndex({
          month,
          referenceDay: todayIso(),
        }),
    )

    return okCached(data, 45)
  } catch (e) {
    return handleError(e)
  }
}
