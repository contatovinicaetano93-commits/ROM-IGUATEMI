import type { SalonDailyMetrics } from '@/lib/salon/metrics'
import { getBrand, getAvecUnitId } from '@/lib/brand'

function getUnitSummary() {
  const brand = getBrand()
  return {
    name: brand.displayName,
    slug: brand.panel,
    avecUnitId: getAvecUnitId(),
    brand: brand.productName,
  }
}

export interface SalonIntelligence {
  unit: ReturnType<typeof getUnitSummary>
  /** Taxa de comparecimento: atendidos ÷ agendados (0–1) */
  attendance_rate: number | null
  /** Receita estimada perdida (no-shows × ticket médio) */
  revenue_at_risk: number
  /** Meta de faturamento do dia (R$) */
  daily_goal: number
  /** Progresso da meta (0–1) */
  goal_progress: number | null
  /** Quanto falta para a meta (R$) */
  goal_gap: number
  /** Ticket médio usado nos cálculos */
  effective_ticket_avg: number | null
}

function num(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : 0
  return Number.isFinite(n) ? n : 0
}

export function getDailyGoal(): number {
  const raw = process.env.SALON_DAILY_GOAL
  if (!raw?.trim()) return 5000
  const n = Number(raw.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : 5000
}

export function computeSalonIntelligence(metrics: SalonDailyMetrics | null): SalonIntelligence {
  const unit = getUnitSummary()
  const daily_goal = getDailyGoal()

  if (!metrics) {
    return {
      unit,
      attendance_rate: null,
      revenue_at_risk: 0,
      daily_goal,
      goal_progress: null,
      goal_gap: daily_goal,
      effective_ticket_avg: null,
    }
  }

  const revenue = num(metrics.revenue)
  const appointments = num(metrics.appointments)
  const attended = num(metrics.attended)
  const no_shows = num(metrics.no_shows)
  const ticket_avg =
    metrics.ticket_avg != null && num(metrics.ticket_avg) > 0
      ? num(metrics.ticket_avg)
      : attended > 0
        ? revenue / attended
        : null

  const attendance_rate =
    appointments > 0 ? Math.min(1, attended / appointments) : attended > 0 ? 1 : null

  const revenue_at_risk = no_shows > 0 && ticket_avg ? no_shows * ticket_avg : 0

  const goal_progress = daily_goal > 0 ? Math.min(1, revenue / daily_goal) : null
  const goal_gap = Math.max(0, daily_goal - revenue)

  return {
    unit,
    attendance_rate,
    revenue_at_risk,
    daily_goal,
    goal_progress,
    goal_gap,
    effective_ticket_avg: ticket_avg,
  }
}

export function attendanceRateLabel(rate: number | null) {
  if (rate === null) return '—'
  return `${(rate * 100).toFixed(0)}%`
}

export function goalProgressLabel(progress: number | null) {
  if (progress === null) return '—'
  return `${(progress * 100).toFixed(0)}%`
}
