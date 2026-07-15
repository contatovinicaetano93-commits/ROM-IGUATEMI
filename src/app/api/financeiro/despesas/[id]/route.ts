import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireFinance } from '@/lib/auth'
import { deleteExpense } from '@/lib/finance'

type Ctx = { params: Promise<{ id: string }> }

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireFinance(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const { id } = await ctx.params
    await deleteExpense(id)
    return ok({ deleted: true })
  } catch (e) {
    return handleError(e)
  }
}
