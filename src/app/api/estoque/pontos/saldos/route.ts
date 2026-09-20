import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireStock } from '@/lib/auth'
import { listBalancesForProduct, listPointBoard } from '@/lib/stock-points-db'

export async function GET(req: NextRequest) {
  try {
    const auth = await requireStock(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const productId = req.nextUrl.searchParams.get('productId')?.trim()
    const locationId = req.nextUrl.searchParams.get('locationId')?.trim() || undefined

    if (productId) {
      return ok({ balances: await listBalancesForProduct(productId) })
    }
    return ok({ board: await listPointBoard(locationId) })
  } catch (e) {
    return handleError(e)
  }
}
