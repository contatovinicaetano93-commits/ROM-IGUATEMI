import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireAdmin } from '@/lib/auth'
import { deactivateVideo } from '@/lib/onboarding'

type Ctx = { params: Promise<{ id: string }> }

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const { id } = await ctx.params
    await deactivateVideo(id)
    return ok({ deactivated: true })
  } catch (e) {
    return handleError(e)
  }
}
