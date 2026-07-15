import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireStock } from '@/lib/auth'
import { acknowledgeAlert } from '@/lib/stock'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireStock(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const { id } = await ctx.params
    await acknowledgeAlert(id, auth.session.user)
    return ok({ acknowledged: true })
  } catch (e) {
    return handleError(e)
  }
}
