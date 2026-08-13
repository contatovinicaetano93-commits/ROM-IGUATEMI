import { computeFinanceKpis, type FinanceKpis, EMPTY_CMV_COVERAGE } from '@/lib/finance'
import { getBrand } from '@/lib/brand'
import {
  computePeriodAnalytics,
  estimateLostRevenue,
  type PeriodAnalytics,
} from '@/lib/salon/period-analytics'
import {
  getMonthCompleteness,
  getSalonMonthMetrics,
  labelMonthPt,
  materializeSalonMonthMetrics,
  monthKeyFromDay,
  monthRange,
  readSalonWindowTotals,
  statusLabelPt,
  type MonthCloseStatus,
  type MonthCompleteness,
  type SalonMonthMetricsRow,
  type SalonWindowTotals,
} from '@/lib/salon/month-metrics'
import {
  formatMonthWindowLabel,
  resolveMonthWindow,
  resolveComparableWindow,
  yearAgoMonthKey,
} from '@/lib/salon/month-window'
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
    cash_flow: number | null
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
    cash_flow: number | null
    lost_revenue: number | null
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
    note: 'Soma de salon_daily_metrics no recorte: 1º até hoje se o mês está aberto; mês cheio se fechado.',
  },
  {
    field: 'despesas',
    source: 'rom_manual',
    note: 'Omie Contas a Pagar (por vencimento, CNPJs serviços/comércio) + lançamentos manuais, no mesmo recorte da receita (MTD se o mês está aberto). Exclui não-operacionais. Série Omie no ROM a partir de jan/2026.',
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
    revenue_source: revenue > 0 ? 'metrics' : 'empty',
    expenses,
    expenses_by_cnpj: {
      total: expenses,
      servicos: 0,
      comercio: 0,
      manual: expenses,
    },
    attended,
    ticket_avg: row.ticket_avg != null ? Number(row.ticket_avg) : null,
    daily: [],
    cmv,
    cmv_coverage: { ...EMPTY_CMV_COVERAGE, cmv },
    margin_after_cmv,
    gross_margin,
    cash_flow: revenue > 0 ? Number(row.cash_flow) || 0 : null,
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

function emptyFinanceBucket(monthKey: string): FinanceKpis['current'] {
  const range = monthRange(monthKey)
  return {
    month: monthKey,
    label: labelMonthPt(monthKey),
    from: range.from,
    to: range.to,
    revenue: 0,
    revenue_source: 'empty',
    expenses: 0,
    expenses_by_cnpj: { total: 0, servicos: 0, comercio: 0, manual: 0 },
    attended: 0,
    ticket_avg: null,
    daily: [],
    cmv: 0,
    cmv_coverage: { ...EMPTY_CMV_COVERAGE },
    margin_after_cmv: null,
    gross_margin: null,
    cash_flow: null,
    payment_mix: [],
    payment_reconciliation: {
      revenue: 0,
      payments_total: 0,
      delta: 0,
      tolerance: 1,
      status: 'aligned',
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

function completenessFromRow(row: SalonMonthMetricsRow): MonthCompleteness {
  const from = String(row.from_day).slice(0, 10)
  const to = String(row.to_day).slice(0, 10)
  return {
    month: row.month,
    label: labelMonthPt(row.month),
    from,
    to,
    check_through: to,
    days_expected: Number(row.days_expected) || 0,
    days_present: Number(row.days_present) || 0,
    days_missing: Array.isArray(row.days_missing) ? row.days_missing.map(String) : [],
    status: row.status,
  }
}

/** Payload gravado por `materializeSalonMonthMetrics({ analytics, finance })`. */
export function analyticsFromMonthPayload(payload: unknown): PeriodAnalytics | null {
  if (!payload || typeof payload !== 'object') return null
  const analytics = (payload as { analytics?: PeriodAnalytics }).analytics
  if (!analytics || typeof analytics !== 'object') return null
  if (typeof analytics.month !== 'string' || typeof analytics.label !== 'string') return null
  if (!analytics.previous || typeof analytics.previous !== 'object') return null
  return analytics
}

/** Analytics mínimo a partir da linha de fechamento — sem bater P1/P2/P3 ao vivo. */
export function analyticsFromMonthRow(row: SalonMonthMetricsRow): PeriodAnalytics {
  const window = resolveMonthWindow(row.month)
  const revenue = Number(row.revenue) || 0
  const attended = Number(row.attended) || 0
  const cancelled = Number(row.cancelled) || 0
  const no_shows = Number(row.no_shows) || 0
  const ticket_avg = row.ticket_avg != null ? Number(row.ticket_avg) : null
  return {
    month: row.month,
    label: labelMonthPt(row.month),
    from: window.from,
    to: window.to,
    snapshot_day: null,
    snapshot_missing: true,
    revenue: revenue > 0 || attended > 0 ? revenue : null,
    attended: attended > 0 || revenue > 0 ? attended : null,
    mtd: window.mtd,
    occupancy_avg: null,
    cancelled,
    no_shows,
    ticket_avg,
    lost_revenue: estimateLostRevenue(cancelled, no_shows, ticket_avg),
    packages: [],
    packages_sold: null,
    packages_revenue: null,
    booking_channels: [],
    acquisition: [],
    return_rate: null,
    new_clients_period: null,
    top_professionals: [],
    top_services: [],
    previous: {
      month: yearAgoMonthKey(row.month),
      label: labelMonthPt(yearAgoMonthKey(row.month)),
      revenue: null,
      attended: null,
      cancelled: 0,
      no_shows: 0,
      ticket_avg: null,
      lost_revenue: null,
      occupancy_avg: null,
      packages_revenue: null,
      new_clients_period: null,
      return_rate: null,
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

function overviewFromCachedRows(args: {
  brand: ReturnType<typeof getBrand>
  month: string
  cached: SalonMonthMetricsRow
  cachedPrev: SalonMonthMetricsRow | null
}): MonthOverview {
  const { brand, month, cached, cachedPrev } = args
  const baseAnalytics =
    analyticsFromMonthPayload(cached.payload) ?? analyticsFromMonthRow(cached)
  const previous = cachedPrev
    ? stubFinanceFromRow(cachedPrev)
    : emptyFinanceBucket(yearAgoMonthKey(month))
  // Se o payload não trouxe MoM e temos mês anterior materializado, preenche deltas.
  const analytics: PeriodAnalytics =
    cachedPrev && baseAnalytics.previous.revenue == null
      ? {
          ...baseAnalytics,
          previous: {
            ...baseAnalytics.previous,
            month: cachedPrev.month,
            label: labelMonthPt(cachedPrev.month),
            revenue: Number(cachedPrev.revenue) || 0,
            attended: Number(cachedPrev.attended) || 0,
            cancelled: Number(cachedPrev.cancelled) || 0,
            no_shows: Number(cachedPrev.no_shows) || 0,
            ticket_avg: cachedPrev.ticket_avg != null ? Number(cachedPrev.ticket_avg) : null,
            lost_revenue: estimateLostRevenue(
              Number(cachedPrev.cancelled) || 0,
              Number(cachedPrev.no_shows) || 0,
              cachedPrev.ticket_avg != null ? Number(cachedPrev.ticket_avg) : null,
            ),
            occupancy_avg: null,
          },
        }
      : baseAnalytics
  return buildOverview({
    brand,
    month,
    finance: { current: stubFinanceFromRow(cached), previous },
    analytics,
    completeness: completenessFromRow(cached),
    materializedAt: cached.materialized_at,
    fromCache: true,
  })
}

function knownDaily(totals: SalonWindowTotals): boolean {
  return totals.revenue > 0 || totals.attended > 0
}

function bucketFromWindowTotals(
  month: string,
  from: string,
  to: string,
  label: string,
  totals: SalonWindowTotals,
): FinanceKpis['current'] {
  const base = emptyFinanceBucket(month)
  const revenue = totals.revenue
  const expenses = totals.expenses
  const cmv = totals.cmv
  const attended = totals.attended
  const revenue_source = knownDaily(totals) ? 'metrics' : 'empty'
  return {
    ...base,
    label,
    from,
    to,
    revenue,
    revenue_source,
    expenses,
    expenses_by_cnpj: { total: expenses, servicos: 0, comercio: 0, manual: expenses },
    attended,
    ticket_avg: totals.ticket_avg,
    cmv,
    cmv_coverage: { ...EMPTY_CMV_COVERAGE, cmv },
    gross_margin: revenue > 0 ? Math.round(((revenue - expenses) / revenue) * 1000) / 10 : null,
    margin_after_cmv:
      revenue > 0 ? Math.round(((revenue - expenses - cmv) / revenue) * 1000) / 10 : null,
    cash_flow: revenue_source === 'empty' ? null : totals.cash_flow,
    payment_reconciliation: {
      revenue,
      payments_total: 0,
      delta: -revenue,
      tolerance: Math.max(1, Math.round(Math.max(revenue, 1) * 0.01 * 100) / 100),
      status: revenue > 0 ? 'missing_payments' : 'aligned',
    },
  }
}

/** Substitui receita/atendidos/despesas do cache pelo acumulado diário do recorte (MTD se aberto). */
export function applyWindowTotalsToOverview(
  overview: MonthOverview,
  current: {
    from: string
    to: string
    month: string
    mtd: boolean
    totals: SalonWindowTotals
  },
  previous?: {
    from: string
    to: string
    month: string
    label: string
    totals: SalonWindowTotals
  } | null,
): MonthOverview {
  const currentLabel = formatMonthWindowLabel(current.month, current.to, current.mtd)
  const currentBucket = bucketFromWindowTotals(
    current.month,
    current.from,
    current.to,
    currentLabel,
    current.totals,
  )
  const overlaid: MonthOverview = {
    ...overview,
    label: currentLabel,
    finance: currentBucket,
    analytics: {
      ...overview.analytics,
      label: currentLabel,
      from: current.from,
      to: current.to,
      mtd: current.mtd,
      revenue: knownDaily(current.totals) ? current.totals.revenue : null,
      attended: knownDaily(current.totals) ? current.totals.attended : null,
      cancelled: current.totals.cancelled,
      no_shows: current.totals.no_shows,
      ticket_avg: current.totals.ticket_avg,
      lost_revenue: estimateLostRevenue(
        current.totals.cancelled,
        current.totals.no_shows,
        current.totals.ticket_avg,
      ),
    },
    closing: {
      ...overview.closing,
      revenue: currentBucket.revenue,
      attended: currentBucket.attended,
      cancelled: current.totals.cancelled,
      no_shows: current.totals.no_shows,
      ticket_avg: current.totals.ticket_avg,
      expenses: current.totals.expenses,
      cmv: current.totals.cmv,
      cash_flow: currentBucket.cash_flow,
    },
  }
  if (!previous) return overlaid

  const previousBucket = bucketFromWindowTotals(
    previous.month,
    previous.from,
    previous.to,
    previous.label,
    previous.totals,
  )
  const prevKnown = knownDaily(previous.totals)
  const prevLost = estimateLostRevenue(
    previous.totals.cancelled,
    previous.totals.no_shows,
    previous.totals.ticket_avg,
  )
  return {
    ...overlaid,
    analytics: {
      ...overlaid.analytics,
      previous: {
        ...overview.analytics.previous,
        month: previous.month,
        label: previous.label,
        revenue: prevKnown ? previous.totals.revenue : null,
        attended: prevKnown ? previous.totals.attended : null,
        cancelled: previous.totals.cancelled,
        no_shows: previous.totals.no_shows,
        ticket_avg: previous.totals.ticket_avg,
        lost_revenue: prevLost,
      },
    },
    previous_label: previous.label,
    previous_closing: {
      ...overview.previous_closing,
      revenue: previousBucket.revenue,
      attended: previousBucket.attended,
      cancelled: previous.totals.cancelled,
      no_shows: previous.totals.no_shows,
      ticket_avg: previous.totals.ticket_avg,
      expenses: previous.totals.expenses,
      cmv: previous.totals.cmv,
      cash_flow: previousBucket.cash_flow,
      lost_revenue: prevLost,
    },
  }
}

async function overlayLiveWindowTotals(
  overview: MonthOverview,
  month: string,
  compareMonth?: string | null,
): Promise<MonthOverview> {
  const currentWindow = resolveMonthWindow(month)
  const comparable = resolveComparableWindow(currentWindow, compareMonth)
  const currentTotals = await readSalonWindowTotals(currentWindow.from, currentWindow.to)
  const previousTotals = await readSalonWindowTotals(comparable.from, comparable.to)
  // Sem totais ao vivo do mês corrente, não mistura MTD com cache (mês cheio / recorte velho).
  if (!currentTotals) return overview
  // Comparável falhou: aplica só o corrente e não carimba rótulo MTD no lado cacheado.
  if (!previousTotals) {
    return applyWindowTotalsToOverview(overview, { ...currentWindow, totals: currentTotals })
  }
  return applyWindowTotalsToOverview(
    overview,
    { ...currentWindow, totals: currentTotals },
    { ...comparable, totals: previousTotals },
  )
}

/**
 * Overview do mês.
 * UI (`materialize=false`): cache de analytics + soma diária ao vivo no recorte MTD
 * (nunca `computeFinanceKpis` / P1–P3 ao vivo — isso estourava 120s no IG).
 * Sem cache: materializa fechamento leve a partir do diário e devolve.
 * `materialize=true` ("Atualizar fechamento"): finance + analytics completos.
 */
export async function computeMonthOverview(opts?: {
  month?: string
  materialize?: boolean
  compareMonth?: string | null
}): Promise<MonthOverview> {
  const month = opts?.month ?? monthKeyFromDay(todayIso())
  const brand = getBrand()
  const wantMaterialize = opts?.materialize === true
  const comparable = resolveComparableWindow(resolveMonthWindow(month), opts?.compareMonth)
  const prevMonth = comparable.month

  if (!wantMaterialize) {
    let cached = await getSalonMonthMetrics(month)
    const cachedPrev = await getSalonMonthMetrics(prevMonth)

    if (!cached) {
      // Fecha o mês a partir do diário (leve) para a próxima leitura ser cache hit.
      try {
        cached = await materializeSalonMonthMetrics(month, null)
      } catch {
        cached = null
      }
    }

    if (cached) {
      return overlayLiveWindowTotals(
        overviewFromCachedRows({ brand, month, cached, cachedPrev }),
        month,
        opts?.compareMonth,
      )
    }

    // Último recurso: completeness vazia (UI pede Atualizar fechamento).
    const completeness = await getMonthCompleteness(month)
    const emptyAnalytics = analyticsFromMonthRow({
      month,
      from_day: completeness.from,
      to_day: completeness.to,
      days_expected: completeness.days_expected,
      days_present: completeness.days_present,
      days_missing: completeness.days_missing,
      status: completeness.status,
      revenue: 0,
      attended: 0,
      cancelled: 0,
      no_shows: 0,
      appointments: 0,
      new_clients: 0,
      returning_clients: 0,
      ticket_avg: null,
      expenses: 0,
      cmv: 0,
      cash_flow: 0,
      payload: null,
      materialized_at: '',
      updated_at: '',
    })
    return overlayLiveWindowTotals(
      buildOverview({
        brand,
        month,
        finance: {
          current: emptyFinanceBucket(month),
          previous: emptyFinanceBucket(prevMonth),
        },
        analytics: emptyAnalytics,
        completeness,
        materializedAt: null,
        fromCache: false,
      }),
      month,
      opts?.compareMonth,
    )
  }

  // Atualizar fechamento — caminho completo (pode levar ~1–2 min no IG).
  // Sequencial: finance e analytics juntos saturavam o pooler e davam timeout.
  const finance = await computeFinanceKpis({ month, compareMonth: opts?.compareMonth ?? undefined })
  const analytics = await computePeriodAnalytics({ month, compareMonth: opts?.compareMonth })
  const completeness = await getMonthCompleteness(month)

  let materializedAt: string | null = null
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
