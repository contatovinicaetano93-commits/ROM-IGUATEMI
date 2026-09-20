import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { getContactById } from '@/lib/contacts'
import { listServiceVisits, getServiceVisitStats, SERVICE_VISIT_PAGE_SIZE } from '@/lib/services'

type Ctx = { params: Promise<{ id: string }> }

/** Paginação do histórico de serviços do contato (perfil). */
export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireSession(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const { id } = await ctx.params
    const contact = await getContactById(id)
    if (!contact) return err('Contato não encontrado', 404)
    if (contact.anonymized_at) return err('Contato anonimizado', 410)

    const url = new URL(req.url)
    const limitRaw = Number(url.searchParams.get('limit') ?? SERVICE_VISIT_PAGE_SIZE)
    const offsetRaw = Number(url.searchParams.get('offset') ?? 0)
    const limit = Number.isFinite(limitRaw) ? limitRaw : SERVICE_VISIT_PAGE_SIZE
    const offset = Number.isFinite(offsetRaw) ? offsetRaw : 0

    const canViewRevenue = auth.session.can_view_revenue
    const [visitsRaw, stats] = await Promise.all([
      listServiceVisits(id, { limit, offset }),
      getServiceVisitStats(id),
    ])
    const visits = visitsRaw.map((v) => (canViewRevenue ? v : { ...v, price: null }))

    return ok({
      visits,
      stats,
      has_more: offset + visits.length < stats.service_count,
      can_view_revenue: canViewRevenue,
    })
  } catch (e) {
    return handleError(e)
  }
}
