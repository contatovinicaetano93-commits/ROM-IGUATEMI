import { NextRequest } from 'next/server'
import { ok, okCached, handleError, err } from '@/lib/api-response'
import { cachedFetch, MemoryCache } from '@/lib/cache'
import { listContactsWithSummary } from '@/lib/contact-summary'
import { upsertContact, logEvent, updateContact } from '@/lib/contacts'
import { addService } from '@/lib/services'
import { SERVICE_CATEGORIES } from '@/lib/services'
import { compareByOverdueThenName } from '@/lib/salon/urgency'
import { requireAuth } from '@/lib/auth'
import { z } from 'zod'

export const maxDuration = 25

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
    const auth = await requireAuth(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const { searchParams } = new URL(req.url)
    const pendingOnly = searchParams.get('pending') === 'true'
    const sort = searchParams.get('sort') ?? 'urgency'
    const query = searchParams.get('q') ?? searchParams.get('query') ?? null
    const status = searchParams.get('status')
    const channel = searchParams.get('channel')

    const rawLimit = Number(searchParams.get('limit') ?? 100)
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(1, rawLimit), 500) : 100

    const cacheKey = [
      'contacts:list:v2',
      `lim=${limit}`,
      `sort=${sort}`,
      `pend=${pendingOnly ? 1 : 0}`,
      `q=${query ?? ''}`,
      `st=${status ?? ''}`,
      `ch=${channel ?? ''}`,
    ].join(':')

    const result = await cachedFetch(
      cacheKey,
      async () => {
        const { items: rawItems, total } = await listContactsWithSummary({
          limit,
          query,
          pendingOnly,
          status,
          channel,
        })
        let items = rawItems
        if (sort === 'urgency') {
          items = [...items].sort(compareByOverdueThenName)
        }
        return { items, total }
      },
      query ? 15 : 30,
    )

    return okCached(
      result.items,
      query ? 15 : 30,
      {
        total: result.total,
        limit,
        status: status ?? 'all',
        channel: channel ?? 'all',
        pending: pendingOnly,
      },
    )
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

    MemoryCache.deletePrefix('contacts:list:')
    return ok(contact, undefined, 201)
  } catch (e) {
    return handleError(e)
  }
}
