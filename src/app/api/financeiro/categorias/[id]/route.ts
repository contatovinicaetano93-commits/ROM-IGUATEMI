import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireFinance } from '@/lib/auth'
import { deactivateCategory } from '@/lib/finance'

type Ctx = { params: Promise<{ id: string }> }

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireFinance(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const { id } = await ctx.params
    await deactivateCategory(id)
    return ok({ deactivated: true })
  } catch (e) {
    return handleError(e)
  }
}
