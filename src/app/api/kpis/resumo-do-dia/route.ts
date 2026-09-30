import { NextRequest } from 'next/server'
import { err, ok, handleError } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import {
  buildProfessionalDayMetrics,
  buildUnitDayMetrics,
  canViewUnitDayRevenue,
} from '@/lib/intranet/resumo-do-dia'
import {
  filterByProfessionalName,
  resolveSessionProfessionalScope,
} from '@/lib/intranet/professional-scope'
import { countDistinctContactIds } from '@/lib/salon/headcount'
import { todayIso } from '@/lib/salon/format'
import { getSalonMetrics } from '@/lib/salon/metrics'
import { listTodayPipeline } from '@/lib/services'

export const maxDuration = 30

/**
 * Resumo do dia — KPIs ao vivo.
 * Unidade (admin/financeiro/ops sem vínculo Avec): salon_daily_metrics.
 * Profissional (Nome no Avec): pipeline filtrado + receita estimada dos concluídos.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const dayParam = req.nextUrl.searchParams.get('day')?.trim()
    const day = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : todayIso()
    const proScope = await resolveSessionProfessionalScope(auth.session)
    const pipeline = await listTodayPipeline(day)

    if (proScope) {
      const scheduled = filterByProfessionalName(pipeline.scheduled, proScope)
      const courtesy = filterByProfessionalName(pipeline.courtesy, proScope)
      const completed = filterByProfessionalName(pipeline.completed, proScope)
      const metrics = buildProfessionalDayMetrics(day, proScope, {
        scheduled,
        courtesy,
        completed,
      })
      return ok({
        ...metrics,
        courtesy: countDistinctContactIds(courtesy),
        can_view_money: true,
        link_to_agenda: '/pipeline',
        link_to_month: '/meu-faturamento',
      })
    }

    const salon = await getSalonMetrics(day)
    const scheduledHeads = countDistinctContactIds(pipeline.scheduled)
    const canMoney = canViewUnitDayRevenue(auth.session.role)
    const metrics = buildUnitDayMetrics(
      salon
        ? {
            day: salon.day,
            revenue: salon.revenue,
            attended: salon.attended,
            no_shows: salon.no_shows,
            cancelled: salon.cancelled,
            ticket_avg: salon.ticket_avg,
            appointments: salon.appointments,
          }
        : { day, revenue: null, attended: null, no_shows: null, cancelled: null, ticket_avg: null },
      scheduledHeads,
      canMoney,
    )

    return ok({
      ...metrics,
      courtesy: countDistinctContactIds(pipeline.courtesy),
      can_view_money: canMoney,
      link_to_agenda: '/pipeline',
      link_to_month: '/meu-faturamento',
    })
  } catch (e) {
    return handleError(e)
  }
}
