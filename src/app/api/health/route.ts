import { NextRequest } from 'next/server'
import { ok, handleError } from '@/lib/api-response'
import { getHealthStatus, getPublicHealthStatus } from '@/lib/health'
import { isAuthorized } from '@/lib/auth'
import { cachedFetch } from '@/lib/cache'

export async function GET(req: NextRequest) {
  try {
    if (await isAuthorized(req)) {
      const slim = req.nextUrl.searchParams.get('slim') === '1'
      if (slim) return ok(await cachedFetch('health:public:v1', () => getPublicHealthStatus(), 20))
      return ok(await cachedFetch('health:full:v1', () => getHealthStatus(), 30))
    }
    return ok(await cachedFetch('health:public:v1', () => getPublicHealthStatus(), 20))
  } catch (e) {
    return handleError(e)
  }
}
