import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, err, handleError } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { getContactById, logEvent } from '@/lib/contacts'
import { addService, listServices, SERVICE_CATEGORIES } from '@/lib/services'
import { enrichServices } from '@/lib/recommendations'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireSession(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const { id } = await ctx.params
    const contact = await getContactById(id)
    if (!contact) return err('Contato não encontrado', 404)
    if (contact.anonymized_at) return err('Contato anonimizado', 410)

    const canViewRevenue = auth.session.can_view_revenue
    const services = enrichServices(await listServices(id)).map((s) =>
      canViewRevenue ? s : { ...s, last_price: null },
    )
    return ok(services)
  } catch (e) {
    return handleError(e)
  }
}

const schema = z.object({
  name: z.string().min(1),
  category: z.enum(SERVICE_CATEGORIES),
  cadenceDays: z.number().int().positive().optional(),
  product: z.string().optional(),
  notes: z.string().optional(),
  lastDoneAt: z.string().datetime().optional(),
})

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const contact = await getContactById(id)
    if (!contact) return err('Contato não encontrado', 404)
    if (contact.anonymized_at) return err('Contato anonimizado', 410)

    const payload = schema.parse(await req.json())
    const service = await addService(id, payload)

    await logEvent({
      contactId: id,
      channel: 'manual',
      direction: 'in',
      handledBy: 'human',
      payload: { service_added: service.name },
    })

    return ok(service, undefined, 201)
  } catch (e) {
    return handleError(e)
  }
}
