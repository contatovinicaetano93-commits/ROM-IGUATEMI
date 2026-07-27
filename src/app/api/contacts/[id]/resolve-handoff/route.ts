import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { getContactById, logEvent, updateContact } from '@/lib/contacts'

type Ctx = { params: Promise<{ id: string }> }

/** POST — equipe assume a conversa; libera a IA (handoff_resolved). */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireSession(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const { id } = await ctx.params
    const contact = await getContactById(id)
    if (!contact) return err('Contato não encontrado', 404)
    if (contact.anonymized_at) return err('Contato anonimizado', 410)

    await logEvent({
      contactId: id,
      channel: 'manual',
      direction: 'in',
      handledBy: 'human',
      payload: { handoff_resolved: true, by: auth.session.user },
    })

    // Sai do estado de espera humana no funil, sem rebaixar quem já agendou/converteu.
    if (contact.status === 'em_atendimento' || contact.status === 'novo') {
      await updateContact(id, { status: 'em_atendimento' })
    }

    const refreshed = await getContactById(id)
    return ok(refreshed ?? contact)
  } catch (e) {
    return handleError(e)
  }
}
