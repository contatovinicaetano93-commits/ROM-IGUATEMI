import { computeFinanceKpis, type FinanceKpis } from '@/lib/finance'
import { getBrand } from '@/lib/brand'
import { computePeriodAnalytics, type PeriodAnalytics } from '@/lib/salon/period-analytics'
import {
  getMonthCompleteness,
  labelMonthPt,
  materializeSalonMonthMetrics,
  monthKeyFromDay,
  statusLabelPt,
  type MonthCloseStatus,
  type MonthCompleteness,
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
  source_notes: MonthOverviewSourceNote[]
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
    source: 'rom_manual',
    note: 'Custo das saídas de estoque no mês (ROM).',
  },
  {
    field: 'ocupação / top serviços / aquisição / canais / pacotes / retorno / novos',
    source: 'avec_snapshot',
    note: 'Snapshot Avec (P1/P2/P3) mais próximo do fim do mês — não é soma diária ROM.',
  },
]

export async function computeMonthOverview(opts?: {
  month?: string
  materialize?: boolean
}): Promise<MonthOverview> {
  const month = opts?.month ?? monthKeyFromDay(todayIso())
  const brand = getBrand()

  const [finance, analytics, completeness] = await Promise.all([
    computeFinanceKpis({ month }),
    computePeriodAnalytics({ month }),
    getMonthCompleteness(month),
  ])

  let materializedAt: string | null = null
  if (opts?.materialize !== false) {
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
      // Tabela ainda não migrada — overview continua com dados ao vivo.
      materializedAt = null
    }
  }

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
    source_notes: SOURCE_NOTES,
  }
}
