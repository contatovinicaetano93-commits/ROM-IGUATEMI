import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { logEvent } from '@/lib/contacts'

type Ctx = { params: Promise<{ id: string }> }

/** Atendente assume a conversa — libera o bot da IA para responder normal de novo. */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireSession(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const { id } = await ctx.params
    await logEvent({
      contactId: id,
      channel: 'whatsapp',
      direction: 'out',
      handledBy: 'human',
      payload: { handoff_resolved: true, by: auth.session.user },
    })

    return ok({ resolved: true })
  } catch (e) {
    return handleError(e)
  }
}
