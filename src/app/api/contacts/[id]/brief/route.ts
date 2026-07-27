import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { getContactById, logEvent } from '@/lib/contacts'
import { listServices, pickLastVisit } from '@/lib/services'
import { enrichServices } from '@/lib/recommendations'
import { getContactRecommendations } from '@/lib/salon/recommendations'
import { resolveBriefCache } from '@/lib/salon/brief-cache'
import { generateBrief } from '@/lib/brief'

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
    const rawServices = await listServices(id)
    const services = enrichServices(rawServices).map((s) =>
      canViewRevenue ? s : { ...s, last_price: null },
    )
    const { recommendations } = await getContactRecommendations(id)
    const last_visitRaw = pickLastVisit(rawServices)
    const last_visit = last_visitRaw
      ? {
          ...last_visitRaw,
          last_price: canViewRevenue ? last_visitRaw.last_price : null,
        }
      : null

    // Brief/IA: nunca embute preço no contexto (staff ≠ admin financeiro).
    const servicesForBrief = enrichServices(rawServices).map((s) => ({
      ...s,
      last_price: null,
    }))

    const cached = await resolveBriefCache(contact, servicesForBrief, recommendations, () =>
      generateBrief(contact, servicesForBrief, recommendations)
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
      can_view_revenue: canViewRevenue,
    })
  } catch (e) {
    return handleError(e)
  }
}
