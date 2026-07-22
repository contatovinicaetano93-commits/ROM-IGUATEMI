import type { ClientService } from '@/lib/services'
import { enrichServices, computeRecommendations } from '@/lib/recommendations'
import { DAY_MS } from '@/lib/salon/constants'

export interface UrgencySummary {
  overdue: number
  /** Maior atraso em dias entre serviços overdue (0 se nenhum). */
  max_overdue_days: number
  due_soon: number
  scheduled_soon: number
  scheduled_today: number
  pending_actions: number
  urgency_score: number
  top_action: string | null
  recommendations: ReturnType<typeof computeRecommendations>
}

/** Ordena: mais tempo sem retorno primeiro; empate A–Z (pt-BR). */
export function compareByOverdueThenName(
  a: { max_overdue_days: number; name: string | null },
  b: { max_overdue_days: number; name: string | null },
): number {
  const byDays = b.max_overdue_days - a.max_overdue_days
  if (byDays !== 0) return byDays
  return (a.name ?? '').localeCompare(b.name ?? '', 'pt-BR', { sensitivity: 'base' })
}

export function urgencyForServices(services: ClientService[]): UrgencySummary {
  const enriched = enrichServices(services)
  const recommendations = computeRecommendations(enriched)
  const now = Date.now()

  const overdueServices = enriched.filter((s) => s.state === 'overdue')
  const overdue = overdueServices.length
  const max_overdue_days = overdueServices.reduce(
    (max, s) => Math.max(max, Math.abs(s.days_until ?? 0)),
    0,
  )
  const due_soon = enriched.filter((s) => s.state === 'due_soon').length
  const scheduled_soon = enriched.filter((s) => {
    if (!s.scheduled_at) return false
    const t = new Date(s.scheduled_at).getTime()
    return t >= now && t - now <= 7 * DAY_MS
  }).length
  const scheduled_today = enriched.filter((s) => {
    if (!s.scheduled_at) return false
    return new Date(s.scheduled_at).toDateString() === new Date().toDateString()
  }).length

  const urgentRecs = recommendations.filter((r) =>
    ['overdue', 'due_soon', 'scheduled'].includes(r.type)
  )
  const pending_actions =
    overdue + due_soon + scheduled_soon > 0 ? overdue + due_soon + scheduled_soon : recommendations.length

  const urgency_score = overdue * 1000 + due_soon * 100 + scheduled_today * 50 + scheduled_soon * 10
  const top = urgentRecs[0] ?? recommendations[0]

  return {
    overdue,
    max_overdue_days,
    due_soon,
    scheduled_soon,
    scheduled_today,
    pending_actions,
    urgency_score,
    top_action: top ? top.title : null,
    recommendations,
  }
}
