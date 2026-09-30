import { countDistinctContactIds } from '@/lib/salon/headcount'
import type { ScheduledServiceRow } from '@/lib/services'

export type ResumoDoDiaMode = 'unit' | 'professional'

export type ResumoDoDiaMetrics = {
  mode: ResumoDoDiaMode
  /** Título de UI: Resumo do dia (unidade) vs Meu dia (profissional). */
  title: string
  day: string
  /** Produção / caixa do dia. Unidade = salon_daily_metrics; pro = soma last_price concluídos. */
  revenue: number | null
  /** Cabeças agendadas (abertos). */
  scheduled: number | null
  /** Cabeças concluídas. */
  attended: number | null
  /** No-shows (só unidade via Avec; pro → null até haver fonte). */
  no_shows: number | null
  /** Cancelados (só unidade). */
  cancelled: number | null
  ticket_avg: number | null
  /** Escopo do profissional, se mode=professional. */
  professional_name: string | null
}

type PipelineBuckets = {
  scheduled: readonly ScheduledServiceRow[]
  courtesy: readonly ScheduledServiceRow[]
  completed: readonly ScheduledServiceRow[]
}

/**
 * KPIs do dia a partir do pipeline (agenda local).
 * Usado no modo profissional — não inventa 0 quando não há preço.
 */
export function buildProfessionalDayMetrics(
  day: string,
  professionalName: string,
  buckets: PipelineBuckets,
): ResumoDoDiaMetrics {
  const scheduledHeads = countDistinctContactIds(buckets.scheduled)
  const completedHeads = countDistinctContactIds(buckets.completed)
  const priced = buckets.completed
    .map((row) => (row.last_price != null ? Number(row.last_price) : null))
    .filter((n): n is number => n != null && Number.isFinite(n))
  const revenue =
    priced.length > 0
      ? Math.round(priced.reduce((sum, n) => sum + n, 0) * 100) / 100
      : null
  const ticket_avg =
    revenue != null && completedHeads > 0
      ? Math.round((revenue / completedHeads) * 100) / 100
      : null

  return {
    mode: 'professional',
    title: 'Meu dia',
    day,
    revenue,
    scheduled: scheduledHeads,
    attended: completedHeads,
    no_shows: null,
    cancelled: null,
    ticket_avg,
    professional_name: professionalName,
  }
}

export type UnitDaySalonSlice = {
  day: string
  revenue: number | null
  attended: number | null
  no_shows: number | null
  cancelled: number | null
  ticket_avg: number | null
  appointments?: number | null
}

/**
 * KPIs do dia da unidade (salon_daily_metrics + cabeças da agenda aberta).
 * `canViewMoney` controla revenue/ticket (admin/financeiro).
 */
export function buildUnitDayMetrics(
  salon: UnitDaySalonSlice | null,
  scheduledHeads: number,
  canViewMoney: boolean,
): ResumoDoDiaMetrics {
  const day = salon?.day ?? ''
  return {
    mode: 'unit',
    title: 'Resumo do dia',
    day,
    revenue: canViewMoney ? (salon?.revenue ?? null) : null,
    scheduled: scheduledHeads,
    attended: salon?.attended ?? null,
    no_shows: salon?.no_shows ?? null,
    cancelled: salon?.cancelled ?? null,
    ticket_avg: canViewMoney ? (salon?.ticket_avg ?? null) : null,
    professional_name: null,
  }
}

/** Quem vê $ da unidade no Resumo do dia. Pro vê só o próprio (outro caminho). */
export function canViewUnitDayRevenue(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'financeiro'
}
