import { okCached, handleError } from '@/lib/api-response'
import { fetchTmComparison } from '@/lib/salon/tm-metrics'
import { ttlGetOrSet } from '@/lib/ttl-cache'

export const maxDuration = 20

export async function GET() {
  try {
    const data = await ttlGetOrSet('kpis:tm', 120_000, () => fetchTmComparison())
    return okCached(data, 60)
  } catch (e) {
    return handleError(e)
  }
}
