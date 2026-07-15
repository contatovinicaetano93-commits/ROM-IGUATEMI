import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireStock } from '@/lib/auth'
import { getProduct } from '@/lib/stock'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireStock(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const { id } = await ctx.params
    const product = await getProduct(id)
    if (!product) return err('Produto não encontrado', 404)
    return ok(product)
  } catch (e) {
    return handleError(e)
  }
}
