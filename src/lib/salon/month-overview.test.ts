import { describe, expect, it } from 'vitest'
import {
  analyticsFromMonthPayload,
  analyticsFromMonthRow,
  applyWindowTotalsToOverview,
  type MonthOverview,
} from '@/lib/salon/month-overview'
import { buildPeriodAnalyticsPrintHtml } from '@/lib/salon/month-overview-export'
import type { SalonMonthMetricsRow, SalonWindowTotals } from '@/lib/salon/month-metrics'

function sampleRow(over: Partial<SalonMonthMetricsRow> = {}): SalonMonthMetricsRow {
  return {
    month: '2026-08',
    from_day: '2026-08-01',
    to_day: '2026-08-04',
    days_expected: 4,
    days_present: 3,
    days_missing: ['2026-08-03'],
    status: 'in_progress',
    revenue: 12000,
    attended: 40,
    cancelled: 2,
    no_shows: 1,
    appointments: 50,
    new_clients: 5,
    returning_clients: 35,
    ticket_avg: 300,
    expenses: 1000,
    cmv: 200,
    cash_flow: 11000,
    payload: null,
    materialized_at: '2026-08-04T12:00:00.000Z',
    updated_at: '2026-08-04T12:00:00.000Z',
    ...over,
  }
}

describe('analyticsFromMonthPayload', () => {
  it('aceita payload com analytics completo', () => {
    const analytics = analyticsFromMonthRow(sampleRow())
    expect(analyticsFromMonthPayload({ analytics, finance: {} })).toEqual(analytics)
  })

  it('rejeita payload sem previous', () => {
    const analytics = analyticsFromMonthRow(sampleRow())
    const { previous: _p, ...broken } = analytics
    expect(analyticsFromMonthPayload({ analytics: broken })).toBeNull()
  })

  it('rejeita null/objeto vazio', () => {
    expect(analyticsFromMonthPayload(null)).toBeNull()
    expect(analyticsFromMonthPayload({})).toBeNull()
  })
})

describe('analyticsFromMonthRow', () => {
  it('monta analytics leve sem rankings Avec', () => {
    const a = analyticsFromMonthRow(sampleRow())
    expect(a.month).toBe('2026-08')
    expect(a.cancelled).toBe(2)
    expect(a.no_shows).toBe(1)
    expect(a.packages).toEqual([])
    expect(a.top_professionals).toEqual([])
    expect(a.new_clients_period).toBeNull()
  })
})

describe('buildPeriodAnalyticsPrintHtml', () => {
  it('mostra — para pacotes/novos nulos em vez do texto null', () => {
    const html = buildPeriodAnalyticsPrintHtml(analyticsFromMonthRow(sampleRow()), 'ROM')
    expect(html).not.toContain('>null<')
    expect(html).toContain('Pacotes vendidos')
    expect(html).toMatch(/Pacotes vendidos<\/td><td>—<\/td>/)
    expect(html).toMatch(/Novos no período<\/td><td>—<\/td>/)
  })
})

function windowTotals(over: Partial<SalonWindowTotals> = {}): SalonWindowTotals {
  return {
    revenue: 1_274_707.12,
    attended: 1335,
    cancelled: 8,
    no_shows: 3,
    ticket_avg: 954.84,
    expenses: 180_000,
    cmv: 40_000,
    cash_flow: 1_094_707.12,
    ...over,
  }
}

function cachedOverview(): MonthOverview {
  const row = sampleRow()
  return {
    unit: 'ROM Iguatemi',
    panel: 'iguatemi',
    month: '2026-08',
    label: 'Ago/2026',
    generated_at: '2026-08-04T12:00:00.000Z',
    completeness: {
      month: '2026-08',
      label: 'Ago/2026',
      from: '2026-08-01',
      to: '2026-08-04',
      check_through: '2026-08-04',
      days_expected: 4,
      days_present: 3,
      days_missing: ['2026-08-03'],
      status: 'in_progress',
    },
    status_label: 'Em andamento',
    finance: {} as MonthOverview['finance'],
    analytics: analyticsFromMonthRow(row),
    closing: {
      revenue: 12_000,
      attended: 40,
      cancelled: 2,
      no_shows: 1,
      ticket_avg: 300,
      expenses: 1_000,
      cmv: 200,
      cash_flow: 11_000,
      days_expected: 4,
      days_present: 3,
      days_missing: ['2026-08-03'],
      status: 'in_progress',
      materialized_at: row.materialized_at,
    },
    previous_label: 'Ago/2025',
    previous_closing: {
      revenue: 3_600_000,
      attended: 3_800,
      cancelled: 20,
      no_shows: 5,
      ticket_avg: 947,
      expenses: 900_000,
      cmv: 100_000,
      cash_flow: 2_700_000,
      lost_revenue: null,
      occupancy_avg: null,
    },
    source_notes: [],
    from_cache: true,
  }
}

describe('applyWindowTotalsToOverview', () => {
  it('Receita bruta = acumulado MTD, não cache antigo nem mês cheio comparado', () => {
    const out = applyWindowTotalsToOverview(
      cachedOverview(),
      {
        month: '2026-08',
        from: '2026-08-01',
        to: '2026-08-13',
        mtd: true,
        totals: windowTotals(),
      },
      {
        month: '2025-08',
        from: '2025-08-01',
        to: '2025-08-13',
        label: 'Ago/2025 (até dia 13)',
        totals: windowTotals({ revenue: 1_526_354, attended: 1_600, cash_flow: 1_526_354 }),
      },
    )
    expect(out.closing.revenue).toBe(1_274_707.12)
    expect(out.closing.attended).toBe(1335)
    expect(out.previous_closing.revenue).toBe(1_526_354)
    expect(out.previous_label).toBe('Ago/2025 (até dia 13)')
    expect(out.label).toBe('Ago/2026 (até dia 13)')
    expect(out.analytics.mtd).toBe(true)
    expect(out.analytics.revenue).toBe(1_274_707.12)
    expect(out.finance.from).toBe('2026-08-01')
    expect(out.finance.to).toBe('2026-08-13')
  })

  it('não carimba MoM quando o comparável não veio — evita misturar MTD com mês cheio', () => {
    const base = cachedOverview()
    const out = applyWindowTotalsToOverview(base, {
      month: '2026-08',
      from: '2026-08-01',
      to: '2026-08-13',
      mtd: true,
      totals: windowTotals(),
    })
    expect(out.closing.revenue).toBe(1_274_707.12)
    expect(out.label).toBe('Ago/2026 (até dia 13)')
    expect(out.previous_label).toBe(base.previous_label)
    expect(out.previous_closing).toEqual(base.previous_closing)
    expect(out.analytics.previous).toEqual(base.analytics.previous)
  })
})
