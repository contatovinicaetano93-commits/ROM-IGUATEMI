import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireAdmin } from '@/lib/auth'
import { anonymizeContact, logEvent } from '@/lib/contacts'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const { id } = await ctx.params
    const contact = await anonymizeContact(id)
    if (!contact) return err('Contato não encontrado ou já anonimizado', 404)

    await logEvent({
      contactId: id,
      channel: 'manual',
      direction: 'in',
      handledBy: 'human',
      payload: { action: 'lgpd_anonymize', by: auth.session.user },
    })

    return ok(contact)
  } catch (e) {
    return handleError(e)
  }
}
