import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireStock } from '@/lib/auth'
import { isAvecConfigured } from '@/lib/avec/client'
import { getLastStockSync, describeStockSyncPlan } from '@/lib/avec/sync-stock'
import { isStockAuthConfigured } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const auth = await requireStock(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const [fast, full] = await Promise.all([getLastStockSync('stock_fast'), getLastStockSync('stock_full')])
    return ok({
      configured: isAvecConfigured(),
      stock_auth_configured: isStockAuthConfigured(),
      plan: describeStockSyncPlan(),
      last_fast: fast,
      last_full: full,
    })
  } catch (e) {
    return handleError(e)
  }
}
