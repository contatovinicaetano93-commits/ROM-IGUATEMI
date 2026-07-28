import { NextRequest } from 'next/server'
import { okCached, err, handleError } from '@/lib/api-response'
import { requireStock } from '@/lib/auth'
import { computeStockKpis } from '@/lib/stock'
import { ttlGetOrSet } from '@/lib/ttl-cache'

export async function GET(req: NextRequest) {
  try {
    const auth = await requireStock(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const kpis = await ttlGetOrSet('estoque:kpis', 45_000, () => computeStockKpis())
    return okCached(kpis, 30)
  } catch (e) {
    return handleError(e)
  }
}
