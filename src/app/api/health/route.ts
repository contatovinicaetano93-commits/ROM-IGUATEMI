import { NextRequest } from 'next/server'
import { ok, handleError } from '@/lib/api-response'
import { getHealthStatus, getLivenessHealthStatus, getPublicHealthStatus } from '@/lib/health'
import { isAuthorized } from '@/lib/auth'
import { cachedFetch } from '@/lib/cache'

export async function GET(req: NextRequest) {
  try {
    if (await isAuthorized(req)) {
      const slim = req.nextUrl.searchParams.get('slim') === '1'
      if (slim) return ok(await cachedFetch('health:public:v2', () => getPublicHealthStatus(), 20))
      return ok(await cachedFetch('health:full:v2', () => getHealthStatus(), 30))
    }
    // Público: só liveness. Sync/ops ficam no health autenticado (monitores de uptime: campo `ok`).
    return ok(await cachedFetch('health:liveness:v1', () => Promise.resolve(getLivenessHealthStatus()), 10))
  } catch (e) {
    return handleError(e)
  }
}
