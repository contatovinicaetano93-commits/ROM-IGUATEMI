import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { getContactById, logEvent } from '@/lib/contacts'
import { listServices, pickLastVisit } from '@/lib/services'
import { enrichServices } from '@/lib/recommendations'
import { getContactRecommendations } from '@/lib/salon/recommendations'
import { resolveBriefCache } from '@/lib/salon/brief-cache'
import { generateBrief } from '@/lib/brief'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const contact = await getContactById(id)
    if (!contact) return err('Contato não encontrado', 404)
    if (contact.anonymized_at) return err('Contato anonimizado', 410)

    const rawServices = await listServices(id)
    const services = enrichServices(rawServices)
    const { recommendations } = await getContactRecommendations(id)
    const last_visit = pickLastVisit(rawServices)

    const cached = await resolveBriefCache(contact, services, recommendations, () =>
      generateBrief(contact, services, recommendations)
    )

    if (!cached.from_cache) {
      await logEvent({
        contactId: id,
        channel: 'manual',
        direction: 'out',
        handledBy: cached.source === 'ai' ? 'ai' : 'system',
        payload: { brief: cached.brief, source: cached.source },
      }).catch(() => {})
    }

    return ok({
      brief: cached.brief,
      source: cached.source,
      from_cache: cached.from_cache,
      recommendations,
      last_visit,
    })
  } catch (e) {
    return handleError(e)
  }
}
