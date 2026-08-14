import { NextRequest } from 'next/server'
import { ok, okCached, handleError, err } from '@/lib/api-response'
import { cachedFetch, MemoryCache } from '@/lib/cache'
import {
  countContactQueues,
  listContactsWithSummary,
  listContactsWithoutServices,
  listNewContactsNotInAvec,
} from '@/lib/contact-summary'
import { upsertContact, logEvent, updateContact } from '@/lib/contacts'
import { addService } from '@/lib/services'
import { SERVICE_CATEGORIES } from '@/lib/services'
import { compareByOverdueThenName } from '@/lib/salon/urgency'
import { requireAuth } from '@/lib/auth'
import { loadAvecSyncMeta } from '@/lib/avec/sync-meta'
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
  phone: z
    .string()
    .min(8, 'Telefone com pelo menos 8 dígitos')
    .refine((v) => v.replace(/\D/g, '').length >= 8, 'Telefone com pelo menos 8 dígitos'),
  email: z.string().email().optional(),
  notes: z.string().optional(),
  services: z.array(serviceSchema).optional(),
})

const URGENCY_QUEUES = ['overdue', 'due_soon', 'scheduled'] as const
type UrgencyQueue = (typeof URGENCY_QUEUES)[number]

function parseUrgencyQueue(raw: string | null): UrgencyQueue | null {
  if (!raw) return null
  return (URGENCY_QUEUES as readonly string[]).includes(raw) ? (raw as UrgencyQueue) : null
}

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
    const urgencyQueue = parseUrgencyQueue(searchParams.get('queue'))
    const countsOnly = searchParams.get('counts') === '1' || searchParams.get('counts') === 'true'
    const newNotAvec =
      searchParams.get('new_not_avec') === '1' ||
      searchParams.get('new_not_avec') === 'true' ||
      searchParams.get('queue') === 'novos'
    const withoutServices =
      searchParams.get('no_services') === '1' ||
      searchParams.get('no_services') === 'true' ||
      searchParams.get('queue') === 'sem_servicos'
    const dayRaw = searchParams.get('day')
    const day = dayRaw && /^\d{4}-\d{2}-\d{2}$/.test(dayRaw) ? dayRaw : null

    const rawLimit = Number(searchParams.get('limit') ?? 100)
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(1, rawLimit), 500) : 100

    const syncMeta = await loadAvecSyncMeta()
    const syncPayload = {
      agenda_stale: syncMeta.agenda_stale,
      agenda_created_at: syncMeta.agenda_created_at,
      fast_stale: syncMeta.fast_stale,
      never_synced: syncMeta.never_synced,
    }

    if (countsOnly) {
      const cacheKey = `contacts:queue-counts:v6:ch=${channel ?? ''}:day=${day ?? 'today'}`
      const queues = await cachedFetch(
        cacheKey,
        () => countContactQueues({ channel, day }),
        30,
      )
      return okCached(null, 30, { queues, sync: syncPayload })
    }

    if (newNotAvec) {
      // v4: list-only (no countContactQueues / urgency scan); UI keeps prev overdue counts
      const cacheKey = `contacts:novos:v4:day=${day ?? 'today'}:lim=${limit}:ch=${channel ?? ''}`
      const result = await cachedFetch(
        cacheKey,
        async () => {
          const listed = await listNewContactsNotInAvec({ day, limit })
          return {
            items: listed.items,
            total: listed.total,
            queues: { novos: listed.total },
          }
        },
        30,
      )
      return okCached(result.items, 30, {
        total: result.total,
        limit,
        status: 'novos',
        channel: channel ?? 'all',
        pending: false,
        queue: 'novos',
        day: day ?? 'today',
        queues: result.queues,
        sync: syncPayload,
      })
    }

    if (withoutServices) {
      const cacheKey = `contacts:sem-servicos:v1:day=${day ?? 'today'}:lim=${limit}:ch=${channel ?? ''}`
      const result = await cachedFetch(
        cacheKey,
        async () => {
          const listed = await listContactsWithoutServices({ day, limit })
          const queues = await countContactQueues({ channel, day })
          return { items: listed.items, total: listed.total, queues }
        },
        30,
      )
      return okCached(result.items, 30, {
        total: result.total,
        limit,
        status: 'sem_servicos',
        channel: channel ?? 'all',
        pending: false,
        queue: 'sem_servicos',
        day: day ?? 'today',
        queues: result.queues,
      })
    }

    const cacheKey = [
      'contacts:list:v9',
      `lim=${limit}`,
      `sort=${sort}`,
      `pend=${pendingOnly ? 1 : 0}`,
      `q=${query ?? ''}`,
      `st=${status ?? ''}`,
      `ch=${channel ?? ''}`,
      `uq=${urgencyQueue ?? ''}`,
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
          orderBy: sort === 'name' ? 'name' : 'urgency',
          urgencyQueue,
        })
        let items = rawItems
        // Agendados já vêm ordenados por horário — não reordenar por atraso.
        if (sort === 'urgency' && urgencyQueue !== 'scheduled') {
          items = [...items].sort(compareByOverdueThenName)
        }

        let queueTotal = total
        let queues: Awaited<ReturnType<typeof countContactQueues>> | null = null
        if (pendingOnly) {
          queues = await countContactQueues({ channel, day })
          if (urgencyQueue) queueTotal = queues[urgencyQueue]
        }

        return { items, total: queueTotal, queues }
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
        queue: urgencyQueue ?? 'all',
        queues: result.queues ?? undefined,
        sync: syncPayload,
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
    MemoryCache.deletePrefix('contacts:queue-counts:')
    MemoryCache.deletePrefix('contacts:novos:')
    return ok(contact, undefined, 201)
  } catch (e) {
    return handleError(e)
  }
}
