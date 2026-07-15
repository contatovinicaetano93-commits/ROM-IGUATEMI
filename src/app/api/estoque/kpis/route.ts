import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireStock } from '@/lib/auth'
import { computeStockKpis } from '@/lib/stock'

export async function GET(req: NextRequest) {
  try {
    const auth = await requireStock(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const kpis = await computeStockKpis()
    return ok(kpis)
  } catch (e) {
    return handleError(e)
  }
}
