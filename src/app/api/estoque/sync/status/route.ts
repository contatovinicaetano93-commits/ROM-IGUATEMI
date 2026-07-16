import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireStock } from '@/lib/auth'
import { isAvecConfigured } from '@/lib/avec/client'
import { getLastStockSync, describeStockSyncPlan } from '@/lib/avec/sync-stock'
import { isStockAuthConfigured } from '@/lib/auth'
import { CircuitBreaker } from '@/lib/circuit-breaker'

export async function GET(req: NextRequest) {
  try {
    const auth = await requireStock(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const [fast, full] = await Promise.all([getLastStockSync('stock_fast'), getLastStockSync('stock_full')])

    const circuitStatus = {
      fast: CircuitBreaker.getStatus('stock_sync_fast'),
      full: CircuitBreaker.getStatus('stock_sync_full'),
    }

    return ok({
      configured: isAvecConfigured(),
      stock_auth_configured: isStockAuthConfigured(),
      plan: describeStockSyncPlan(),
      last_fast: fast,
      last_full: full,
      circuit_status: circuitStatus,
    })
  } catch (e) {
    return handleError(e)
  }
}
