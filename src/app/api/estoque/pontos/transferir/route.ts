import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireStock } from '@/lib/auth'
import { transferBetweenPoints } from '@/lib/stock-points-db'

export async function POST(req: NextRequest) {
  try {
    const auth = await requireStock(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') return err('Dados inválidos', 400)

    const productId = typeof body.productId === 'string' ? body.productId : ''
    const fromLocationId = typeof body.fromLocationId === 'string' ? body.fromLocationId : ''
    const toLocationId = typeof body.toLocationId === 'string' ? body.toLocationId : ''
    const quantity = typeof body.quantity === 'number' ? body.quantity : Number(body.quantity)
    const note = typeof body.note === 'string' ? body.note : null

    if (!productId || !fromLocationId || !toLocationId || !(quantity > 0)) {
      return err('productId, fromLocationId, toLocationId e quantity > 0 são obrigatórios', 400)
    }

    const result = await transferBetweenPoints({
      productId,
      fromLocationId,
      toLocationId,
      quantity,
      createdBy: auth.session.user,
      note,
    })
    return ok(result)
  } catch (e) {
    if (e instanceof Error) return err(e.message, 400)
    return handleError(e)
  }
}
