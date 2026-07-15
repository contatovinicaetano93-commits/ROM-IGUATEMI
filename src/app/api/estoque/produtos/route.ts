import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireStock } from '@/lib/auth'
import { listProducts } from '@/lib/stock'

export async function GET(req: NextRequest) {
  try {
    const auth = await requireStock(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const sp = req.nextUrl.searchParams
    const products = await listProducts({
      categoryId: sp.get('categoryId') ?? undefined,
      brandId: sp.get('brandId') ?? undefined,
      locationId: sp.get('locationId') ?? undefined,
      lowStockOnly: sp.get('lowStockOnly') === '1',
    })
    return ok(products)
  } catch (e) {
    return handleError(e)
  }
}
