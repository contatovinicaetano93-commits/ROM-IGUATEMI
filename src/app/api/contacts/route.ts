import { NextRequest } from 'next/server'
import { ok, handleError, err } from '@/lib/api-response'
import { listContactsWithSummary } from '@/lib/contact-summary'
import { upsertContact, logEvent, updateContact } from '@/lib/contacts'
import { addService } from '@/lib/services'
import { SERVICE_CATEGORIES } from '@/lib/services'
import { compareByOverdueThenName } from '@/lib/salon/urgency'
import { requireAuth } from '@/lib/auth'
import { z } from 'zod'

const serviceSchema = z.object({
  name: z.string().min(1),
  category: z.enum(SERVICE_CATEGORIES),
  cadenceDays: z.number().int().positive().optional(),
  product: z.string().optional(),
  notes: z.string().optional(),
})

const schema = z.object({
  name: z.string().min(1),
  phone: z.string().min(8),
  email: z.string().email().optional(),
  notes: z.string().optional(),
  services: z.array(serviceSchema).optional(),
})

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const pendingOnly = searchParams.get('pending') === 'true'
    const sort = searchParams.get('sort') ?? 'urgency'

    const rawLimit = Number(searchParams.get('limit') ?? 500)
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(1, rawLimit), 500) : 500
    let items = await listContactsWithSummary(limit)

    if (pendingOnly) {
      items = items.filter((c) => c.pending_actions > 0)
    }

    if (sort === 'urgency') {
      // Mais tempo sem retorno (dias) primeiro; empate em ordem alfabética.
      items.sort(compareByOverdueThenName)
    }

    return ok(items)
  } catch (e) {
    return handleError(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const body = await req.json()
    const payload = schema.parse(body)

    const contact = await upsertContact({
      name: payload.name,
      phone: payload.phone,
      email: payload.email,
      channel: 'manual',
      source: 'atendente',
    })

    if (payload.email || payload.notes) {
      await updateContact(contact.id, { email: payload.email, notes: payload.notes })
    }

    for (const s of payload.services ?? []) {
      await addService(contact.id, {
        name: s.name,
        category: s.category,
        cadenceDays: s.cadenceDays,
        product: s.product,
        notes: s.notes,
      })
    }

    await logEvent({
      contactId: contact.id,
      channel: 'manual',
      direction: 'in',
      handledBy: 'human',
      payload: { notes: payload.notes ?? null, services: payload.services?.length ?? 0 },
    })

    return ok(contact, undefined, 201)
  } catch (e) {
    return handleError(e)
  }
}
