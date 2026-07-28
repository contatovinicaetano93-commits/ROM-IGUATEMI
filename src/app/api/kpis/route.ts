import { okCached, handleError } from '@/lib/api-response'
import { fetchContactKpis } from '@/lib/salon/kpis'
import { ttlGetOrSet } from '@/lib/ttl-cache'

export const maxDuration = 20

export async function GET() {
  try {
    const data = await ttlGetOrSet('kpis:contacts:30', 45_000, () => fetchContactKpis(30))
    return okCached(data, 45)
  } catch (e) {
    return handleError(e)
  }
}
