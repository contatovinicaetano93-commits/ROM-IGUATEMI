import type { ClientService } from '@/lib/services'
import { enrichServices, computeRecommendations } from '@/lib/recommendations'
import { SCHEDULED_SOON_DAYS } from '@/lib/salon/constants'
import { todayIso, toSalonDateIso } from '@/lib/salon/format'
import { compareByNamePtBr } from '@/lib/salon/sort'

/** Soma dias em YYYY-MM-DD (calendário, sem fuso). */
function addIsoDays(isoDay: string, days: number): string {
  const [y, m, d] = isoDay.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

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
  return compareByNamePtBr(a.name, b.name)
}

export function urgencyForServices(services: ClientService[]): UrgencySummary {
  const enriched = enrichServices(services)
  const recommendations = computeRecommendations(enriched)

  const overdueServices = enriched.filter((s) => s.state === 'overdue')
  const overdue = overdueServices.length
  const max_overdue_days = overdueServices.reduce(
    (max, s) => Math.max(max, Math.abs(s.days_until ?? 0)),
    0,
  )
  const due_soon = enriched.filter((s) => s.state === 'due_soon').length
  const salonToday = todayIso()
  const scheduledUntil = addIsoDays(salonToday, SCHEDULED_SOON_DAYS)
  // Inclui o dia civil inteiro (mesmo horário já passado) até +SCHEDULED_SOON_DAYS.
  const scheduled_soon = enriched.filter((s) => {
    if (!s.scheduled_at) return false
    const day = toSalonDateIso(s.scheduled_at)
    return day != null && day >= salonToday && day <= scheduledUntil
  }).length
  const scheduled_today = enriched.filter((s) => {
    if (!s.scheduled_at) return false
    return toSalonDateIso(s.scheduled_at) === salonToday
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
