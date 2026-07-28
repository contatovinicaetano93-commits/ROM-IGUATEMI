import { computeFinanceKpis, type FinanceKpis, EMPTY_CMV_COVERAGE } from '@/lib/finance'
import { getBrand } from '@/lib/brand'
import { computePeriodAnalytics, type PeriodAnalytics } from '@/lib/salon/period-analytics'
import {
  getMonthCompleteness,
  getSalonMonthMetrics,
  labelMonthPt,
  materializeSalonMonthMetrics,
  monthKeyFromDay,
  monthRange,
  statusLabelPt,
  type MonthCloseStatus,
  type MonthCompleteness,
  type SalonMonthMetricsRow,
} from '@/lib/salon/month-metrics'
import { todayIso } from '@/lib/salon/format'

export interface MonthOverviewSourceNote {
  field: string
  source: 'rom_daily' | 'rom_manual' | 'avec_snapshot'
  note: string
}

export interface MonthOverview {
  unit: string
  panel: string
  month: string
  label: string
  generated_at: string
  completeness: MonthCompleteness
  status_label: string
  finance: FinanceKpis['current']
  analytics: PeriodAnalytics
  closing: {
    revenue: number
    attended: number
    cancelled: number
    no_shows: number
    ticket_avg: number | null
    expenses: number
    cmv: number
    cash_flow: number
    days_expected: number
    days_present: number
    days_missing: string[]
    status: MonthCloseStatus
    materialized_at: string | null
  }
  /** Totais do mês comparado (MTD alinhado) — para deltas nos cards de Relatórios. */
  previous_label: string
  previous_closing: {
    revenue: number
    attended: number
    cancelled: number
    no_shows: number
    ticket_avg: number | null
    expenses: number
    cmv: number
    cash_flow: number
    lost_revenue: number
    occupancy_avg: number | null
  }
  source_notes: MonthOverviewSourceNote[]
  /** true quando fechamento veio de salon_month_metrics (leitura rápida). */
  from_cache?: boolean
}

const SOURCE_NOTES: MonthOverviewSourceNote[] = [
  {
    field: 'receita / atendidos / ticket / cancelamentos',
    source: 'rom_daily',
    note: 'Soma de salon_daily_metrics (fechamento ROM). Alimentado pelo sync Avec + histórico.',
  },
  {
    field: 'despesas',
    source: 'rom_manual',
    note: 'Cadastro manual no Financeiro ROM.',
  },
  {
    field: 'CMV',
    source: 'rom_daily',
    note: 'Proxy: custo das saídas de estoque no mês (Avec 0044 → stock_movements).',
  },
  {
    field: 'ocupação / top serviços / aquisição / canais / pacotes / retorno / novos',
    source: 'avec_snapshot',
    note: 'Snapshot Avec (P1/P2/P3) mais próximo do fim do mês — não é soma diária ROM.',
  },
]

function previousMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  const d = new Date(Date.UTC(y!, m! - 2, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function stubFinanceFromRow(row: SalonMonthMetricsRow): FinanceKpis['current'] {
  const revenue = Number(row.revenue) || 0
  const expenses = Number(row.expenses) || 0
  const cmv = Number(row.cmv) || 0
  const attended = Number(row.attended) || 0
  const gross_margin =
    revenue > 0 ? Math.round(((revenue - expenses) / revenue) * 1000) / 10 : null
  const margin_after_cmv =
    revenue > 0 ? Math.round(((revenue - expenses - cmv) / revenue) * 1000) / 10 : null
  const range = monthRange(row.month)
  return {
    month: row.month,
    label: labelMonthPt(row.month),
    from: range.from,
    to: range.to,
    revenue,
    expenses,
    attended,
    ticket_avg: row.ticket_avg != null ? Number(row.ticket_avg) : null,
    daily: [],
    cmv,
    cmv_coverage: { ...EMPTY_CMV_COVERAGE, cmv },
    margin_after_cmv,
    gross_margin,
    cash_flow: Number(row.cash_flow) || 0,
    payment_mix: [],
    payment_reconciliation: {
      revenue,
      payments_total: 0,
      delta: -revenue,
      tolerance: Math.max(1, Math.round(revenue * 0.01 * 100) / 100),
      status: revenue > 0 ? 'missing_payments' : 'aligned',
    },
    fiscal_split: {
      gross_paid: 0,
      cbs_retained: 0,
      ibs_retained: 0,
      net_received: 0,
      pending_count: 0,
      settled_count: 0,
      configured: false,
    },
  }
}

function buildOverview(args: {
  brand: ReturnType<typeof getBrand>
  month: string
  finance: FinanceKpis
  analytics: PeriodAnalytics
  completeness: MonthCompleteness
  materializedAt: string | null
  fromCache?: boolean
}): MonthOverview {
  const { brand, month, finance, analytics, completeness, materializedAt, fromCache } = args
  return {
    unit: brand.displayName,
    panel: brand.panel,
    month,
    label: labelMonthPt(month),
    generated_at: new Date().toISOString(),
    completeness,
    status_label: statusLabelPt(completeness.status),
    finance: finance.current,
    analytics,
    closing: {
      revenue: finance.current.revenue,
      attended: finance.current.attended,
      cancelled: analytics.cancelled,
      no_shows: analytics.no_shows,
      ticket_avg: finance.current.ticket_avg,
      expenses: finance.current.expenses,
      cmv: finance.current.cmv,
      cash_flow: finance.current.cash_flow,
      days_expected: completeness.days_expected,
      days_present: completeness.days_present,
      days_missing: completeness.days_missing,
      status: completeness.status,
      materialized_at: materializedAt,
    },
    previous_label: finance.previous.label,
    previous_closing: {
      revenue: finance.previous.revenue,
      attended: finance.previous.attended,
      cancelled: analytics.previous.cancelled,
      no_shows: analytics.previous.no_shows,
      ticket_avg: finance.previous.ticket_avg,
      expenses: finance.previous.expenses,
      cmv: finance.previous.cmv,
      cash_flow: finance.previous.cash_flow,
      lost_revenue: analytics.previous.lost_revenue,
      occupancy_avg: analytics.previous.occupancy_avg,
    },
    source_notes: SOURCE_NOTES,
    from_cache: fromCache,
  }
}

/**
 * Overview do mês.
 * UI (`materialize=false`): tenta leitura rápida de `salon_month_metrics` + analytics;
 * só recalcula finance completo se o cache mensal não existir.
 */
export async function computeMonthOverview(opts?: {
  month?: string
  materialize?: boolean
}): Promise<MonthOverview> {
  const month = opts?.month ?? monthKeyFromDay(todayIso())
  const brand = getBrand()
  const wantMaterialize = opts?.materialize !== false
  const prevMonth = previousMonthKey(month)

  if (!wantMaterialize) {
    const [cached, cachedPrev, analytics, completeness] = await Promise.all([
      getSalonMonthMetrics(month),
      getSalonMonthMetrics(prevMonth),
      computePeriodAnalytics({ month }),
      getMonthCompleteness(month),
    ])

    if (cached && Number(cached.revenue) > 0) {
      const current = stubFinanceFromRow(cached)
      const previous = cachedPrev
        ? stubFinanceFromRow(cachedPrev)
        : {
            ...stubFinanceFromRow({
              ...cached,
              month: prevMonth,
              revenue: 0,
              attended: 0,
              cancelled: 0,
              no_shows: 0,
              expenses: 0,
              cmv: 0,
              cash_flow: 0,
              ticket_avg: null,
            }),
            label: labelMonthPt(prevMonth),
            month: prevMonth,
          }

      return buildOverview({
        brand,
        month,
        finance: { current, previous },
        analytics,
        completeness,
        materializedAt: cached.materialized_at,
        fromCache: true,
      })
    }
  }

  const [finance, analytics, completeness] = await Promise.all([
    computeFinanceKpis({ month }),
    computePeriodAnalytics({ month }),
    getMonthCompleteness(month),
  ])

  let materializedAt: string | null = null
  if (wantMaterialize) {
    try {
      const row = await materializeSalonMonthMetrics(month, {
        analytics,
        finance: {
          revenue: finance.current.revenue,
          expenses: finance.current.expenses,
          cmv: finance.current.cmv,
          payment_mix: finance.current.payment_mix,
        },
      })
      materializedAt = row.materialized_at
    } catch {
      materializedAt = null
    }
  }

  return buildOverview({
    brand,
    month,
    finance,
    analytics,
    completeness,
    materializedAt,
    fromCache: false,
  })
}
