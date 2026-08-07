/**
 * Backfill da Visão analítica: snapshots P1/P2/P3 no fim do mês +
 * cancelamentos/no-shows do calendário do mês (em chunks).
 * (O revenue-backfill só cobre receita/atendidos — não os KPIs comerciais.)
 */
import { syncP1Kpis } from '@/lib/avec/sync-p1'
import { syncP2Kpis } from '@/lib/avec/sync-p2'
import { syncP3Kpis } from '@/lib/avec/sync-p3'
import {
  syncCancellationsDateRange,
  syncNoShows0248DateRange,
  type AvecSyncStats,
} from '@/lib/avec/sync'
import { periodRangeEndingOn } from '@/lib/avec/client'
import { todayIso } from '@/lib/salon/format'
import { getDeploymentContext } from '@/lib/deployment'
import { monthToDateRange } from '@/lib/salon/period-analytics'

export type AnalyticsBackfillStep = 'p1' | 'p2' | 'p3' | 'snapshots' | 'cancellations'

export type AnalyticsBackfillResult = {
  month: string
  anchor_day: string
  from: string
  to: string
  steps: AnalyticsBackfillStep[]
  cancel_from: string | null
  cancel_to: string | null
  next_cancel_from: string | null
  cancellations_done: boolean
  p1_rows: number
  p2_rows: number
  p3_rows: number
  cancellation_rows: number
  snapshots_saved: number
  errors: string[]
  warnings: string[]
}

export type AnalyticsBackfillOpts = {
  /**
   * Default: ['p1'] — uma fatia por invocação evita timeout Avec/Vercel.
   * 'snapshots' = p1+p2+p3 na mesma chamada (só se a API estiver rápida).
   */
  steps?: AnalyticsBackfillStep[]
  /**
   * Âncora ISO (YYYY-MM-DD) dentro do mês — grava snapshot MTD até esse dia
   * (ex.: 2026-07-07 para delta alinhado com 1–7/ago). Default = fim da janela do mês.
   */
  asOf?: string
  /** Início do chunk de cancelamentos (default = 1º do mês). */
  cancelFrom?: string
  /** Tamanho do chunk de cancelamentos (1–14, default 5). */
  cancelMaxDays?: number
}

function emptyStats(): AvecSyncStats {
  const deployment = getDeploymentContext()
  return {
    panel: deployment.panel,
    deployment_host: deployment.host,
    clients_upserted: 0,
    appointments_synced: 0,
    attendances_synced: 0,
    services_created: 0,
    services_scheduled: 0,
    services_completed: 0,
    revenue_rows: 0,
    cancellation_rows: 0,
    snapshots_saved: 0,
    errors: [],
    warnings: [],
    p1_rows: 0,
    p2_rows: 0,
    p3_rows: 0,
  }
}

function parseMonthKey(month: string): string | null {
  const m = month.trim()
  if (!/^\d{4}-\d{2}$/.test(m)) return null
  const mm = Number(m.slice(5))
  if (mm < 1 || mm > 12) return null
  return m
}

function addCalendarDays(isoYmd: string, delta: number) {
  const [y, m, d] = isoYmd.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d! + delta)).toISOString().slice(0, 10)
}

/** Lista YYYY-MM de Jan até o mês anterior ao corrente (ou até `throughMonth`). */
export function monthsNeedingAnalyticsBackfill(opts?: {
  year?: number
  throughMonth?: string
  referenceDay?: string
}): string[] {
  const ref = opts?.referenceDay ?? todayIso()
  const through =
    opts?.throughMonth && parseMonthKey(opts.throughMonth)
      ? opts.throughMonth
      : (() => {
          const [y, m] = ref.split('-').map(Number)
          const prev = m === 1 ? { y: y! - 1, m: 12 } : { y: y!, m: m! - 1 }
          return `${prev.y}-${String(prev.m).padStart(2, '0')}`
        })()
  // Ano do `through` (não do referência): em janeiro, through é Dez do ano anterior.
  const year = opts?.year ?? Number(through.slice(0, 4))

  const out: string[] = []
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, '0')}`
    if (key > through) break
    out.push(key)
  }
  return out
}

/**
 * Preenche um mês fechado da Visão analítica.
 * - snapshots: P1/P2/P3 com âncora = último dia do mês
 * - cancellations: 0052 dia a dia + 0248 no chunk (use next_cancel_from até done)
 */
export async function runAnalyticsMonthBackfill(
  month: string,
  opts?: AnalyticsBackfillOpts,
): Promise<AnalyticsBackfillResult> {
  const monthKey = parseMonthKey(month)
  if (!monthKey) {
    throw new Error(`Mês inválido: ${month} (use YYYY-MM)`)
  }

  const { from, to: monthDefaultTo } = monthToDateRange(monthKey)
  const asOfRaw = opts?.asOf?.trim()
  const to =
    asOfRaw &&
    /^\d{4}-\d{2}-\d{2}$/.test(asOfRaw) &&
    asOfRaw.slice(0, 7) === monthKey &&
    asOfRaw >= from
      ? asOfRaw
      : monthDefaultTo
  const stepsRaw = opts?.steps?.length ? opts.steps : (['p1'] as AnalyticsBackfillStep[])
  const expanded: AnalyticsBackfillStep[] = []
  for (const s of stepsRaw) {
    if (s === 'snapshots') {
      expanded.push('p1', 'p2', 'p3')
    } else if (s === 'p1' || s === 'p2' || s === 'p3' || s === 'cancellations') {
      expanded.push(s)
    }
  }
  const steps = [...new Set(expanded)]
  if (!steps.length) {
    throw new Error("steps deve incluir 'p1'|'p2'|'p3'|'snapshots'|'cancellations'")
  }

  const stats = emptyStats()
  let cancel_from: string | null = null
  let cancel_to: string | null = null
  let next_cancel_from: string | null = null
  let cancellations_done = !steps.includes('cancellations')
  // P1 = mês calendário (ranking). P2/P3 mantêm janela ~30d ancorada no asOf.
  const rolling = periodRangeEndingOn(to, 30)
  const p1Opts = { asOf: to }
  const p23Opts = { asOf: to, inicio: rolling.inicio, fim: rolling.fim }

  if (steps.includes('p1')) {
    await syncP1Kpis(stats, undefined, p1Opts)
  }
  if (steps.includes('p2')) {
    await syncP2Kpis(stats, undefined, { ...p23Opts, includePaymentMix: false })
  }
  if (steps.includes('p3')) {
    await syncP3Kpis(stats, undefined, p23Opts)
  }

  if (steps.includes('cancellations')) {
    const maxDaysRaw = opts?.cancelMaxDays ?? 5
    const maxDays = Math.min(14, Math.max(1, Math.floor(maxDaysRaw)))
    const start =
      opts?.cancelFrom && /^\d{4}-\d{2}-\d{2}$/.test(opts.cancelFrom) && opts.cancelFrom >= from
        ? opts.cancelFrom
        : from
    const endCandidate = addCalendarDays(start, maxDays - 1)
    const end = endCandidate > to ? to : endCandidate
    cancel_from = start
    cancel_to = end
    await syncCancellationsDateRange(stats, start, end)
    await syncNoShows0248DateRange(stats, start, end)
    if (end < to) {
      next_cancel_from = addCalendarDays(end, 1)
      cancellations_done = false
    } else {
      cancellations_done = true
    }
  }

  return {
    month: monthKey,
    anchor_day: to,
    from,
    to,
    steps,
    cancel_from,
    cancel_to,
    next_cancel_from,
    cancellations_done,
    p1_rows: stats.p1_rows ?? 0,
    p2_rows: stats.p2_rows ?? 0,
    p3_rows: stats.p3_rows ?? 0,
    cancellation_rows: stats.cancellation_rows,
    snapshots_saved: stats.snapshots_saved,
    errors: stats.errors,
    warnings: stats.warnings,
  }
}
