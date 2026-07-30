import { describe, expect, it } from 'vitest'
import type { FinanceKpis } from '@/lib/finance'
import {
  alignDailyRevenue,
  buildFinanceComparePrintHtml,
  dayOfMonth,
  financeCompareMoneyBars,
} from '@/lib/finance-compare-export'

function bucket(partial: {
  month: string
  label: string
  revenue: number
  expenses?: number
  attended?: number
  ticket_avg?: number | null
  cmv?: number
  daily?: {
    day: string
    revenue: number
    attended: number
    ticket_avg: number | null
    expenses_servicos?: number
    expenses_comercio?: number
  }[]
}): FinanceKpis['current'] {
  const expenses = partial.expenses ?? 0
  const revenue = partial.revenue
  const attended = partial.attended ?? 0
  const cmv = partial.cmv ?? 0
  return {
    month: partial.month,
    label: partial.label,
    from: `${partial.month}-01`,
    to: `${partial.month}-28`,
    revenue,
    expenses,
    expenses_by_cnpj: { total: expenses, servicos: expenses, comercio: 0, manual: 0 },
    attended,
    ticket_avg: partial.ticket_avg ?? (attended > 0 ? revenue / attended : null),
    daily: (partial.daily ?? []).map((d) => ({
      expenses_servicos: 0,
      expenses_comercio: 0,
      ...d,
    })),
    cmv,
    cmv_coverage: {
      cmv,
      saidas_total: 0,
      with_movement_cost: 0,
      with_product_fallback: 0,
      with_zero: 0,
      movement_cost_pct: null,
      any_cost_pct: null,
    },
    margin_after_cmv: revenue > 0 ? ((revenue - expenses - cmv) / revenue) * 100 : null,
    gross_margin: revenue > 0 ? ((revenue - expenses) / revenue) * 100 : null,
    cash_flow: revenue - expenses,
    payment_mix: [],
    payment_reconciliation: {
      revenue,
      payments_total: 0,
      delta: -revenue,
      tolerance: 0,
      status: 'missing_payments',
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

const sample: FinanceKpis = {
  current: bucket({
    month: '2026-07',
    label: 'Jul/2026',
    revenue: 2_873_783.43,
    attended: 2855,
    cmv: 98_406.08,
    daily: [
      { day: '2026-07-01', revenue: 160_550.35, attended: 152, ticket_avg: 1056.25 },
      { day: '2026-07-02', revenue: 160_859.74, attended: 172, ticket_avg: 935.23 },
    ],
  }),
  previous: bucket({
    month: '2026-06',
    label: 'Jun/2026',
    revenue: 0,
    attended: 0,
    cmv: 63_986.11,
    daily: [{ day: '2026-06-01', revenue: 50_000, attended: 40, ticket_avg: 1250 }],
  }),
}

describe('finance-compare-export', () => {
  it('dayOfMonth extrai dia', () => {
    expect(dayOfMonth('2026-07-09')).toBe(9)
  })

  it('financeCompareMoneyBars monta série Jul vs Jun', () => {
    const bars = financeCompareMoneyBars(sample)
    expect(bars.map((b) => b.label)).toEqual(['Receita', 'Despesas', 'Fluxo', 'CMV'])
    expect(bars[0]?.current).toBe(2_873_783.43)
    expect(bars[0]?.previous).toBe(0)
    expect(bars[3]?.previous).toBe(63_986.11)
  })

  it('alignDailyRevenue alinha pelo dia do mês', () => {
    const aligned = alignDailyRevenue(sample.current.daily, sample.previous.daily)
    expect(aligned[0]).toEqual({ day: 1, current: 160_550.35, previous: 50_000 })
    expect(aligned[1]).toEqual({ day: 2, current: 160_859.74, previous: 0 })
  })

  it('buildFinanceComparePrintHtml inclui resumo, page-break e SVGs', () => {
    const html = buildFinanceComparePrintHtml(sample, 'ROM Iguatemi')
    expect(html).toContain('Jul/2026')
    expect(html).toContain('Jun/2026')
    expect(html).toContain('page-break-before: always')
    expect(html).toContain('Gráficos')
    expect(html).toContain('<svg')
    expect(html).toContain('2.873.783,43')
  })

  it('SVG de barras não gera height negativo com fluxo negativo', () => {
    const neg: FinanceKpis = {
      ...sample,
      current: { ...sample.current, expenses: 5_000_000, cash_flow: sample.current.revenue - 5_000_000 },
      previous: { ...sample.previous, expenses: 100, cash_flow: -100 },
    }
    const html = buildFinanceComparePrintHtml(neg)
    expect(html).not.toMatch(/height="-\d/)
  })
})
