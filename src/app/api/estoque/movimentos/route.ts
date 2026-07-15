import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, err, handleError } from '@/lib/api-response'
import { requireStock } from '@/lib/auth'
import { listMovements, createManualMovement } from '@/lib/stock'

export async function GET(req: NextRequest) {
  try {
    const auth = await requireStock(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const sp = req.nextUrl.searchParams
    const movements = await listMovements({
      productId: sp.get('productId') ?? undefined,
      from: sp.get('from') ?? undefined,
      to: sp.get('to') ?? undefined,
    })
    return ok(movements)
  } catch (e) {
    return handleError(e)
  }
}

const createSchema = z.object({
  productId: z.string().uuid(),
  type: z.enum(['entrada', 'saida', 'ajuste_manual']),
  quantity: z.number().positive(),
  reason: z.string().min(1),
})

export async function POST(req: NextRequest) {
  try {
    const auth = await requireStock(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const body = createSchema.parse(await req.json())
    const movement = await createManualMovement({ ...body, createdBy: auth.session.user })
    return ok(movement, undefined, 201)
  } catch (e) {
    return handleError(e)
  }
}
