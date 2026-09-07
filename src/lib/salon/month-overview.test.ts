import { describe, expect, it } from 'vitest'
import {
  analyticsFromMonthPayload,
  analyticsFromMonthRow,
  overlayCachedPrevious,
  overviewFromCachedRows,
} from '@/lib/salon/month-overview'
import { buildPeriodAnalyticsPrintHtml } from '@/lib/salon/month-overview-export'
import type { SalonMonthMetricsRow } from '@/lib/salon/month-metrics'
import { getBrand } from '@/lib/brand'
import { resolveComparableWindow, resolveMonthWindow } from '@/lib/salon/month-window'

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

describe('overlayCachedPrevious', () => {
  const prevWindow = resolveComparableWindow(resolveMonthWindow('2026-08', '2026-08-13'), '2026-03')

  it('substitui previous do payload quando o compare é outro mês', () => {
    const baked = analyticsFromMonthRow(sampleRow())
    baked.previous = {
      ...baked.previous,
      month: '2025-08',
      label: 'Ago/2025',
      revenue: 99_000,
      occupancy_avg: 0.8,
      packages_revenue: 500,
    }
    const cachedPrev = sampleRow({
      month: '2026-03',
      from_day: '2026-03-01',
      to_day: '2026-03-13',
      revenue: 4_000,
      attended: 10,
    })
    const aligned = overlayCachedPrevious(baked, cachedPrev, prevWindow)
    expect(aligned.previous.month).toBe('2026-03')
    expect(aligned.previous.revenue).toBe(4_000)
    expect(aligned.previous.occupancy_avg).toBeNull()
    expect(aligned.previous.packages_revenue).toBeNull()
  })

  it('sem cache usa o mês comparado, não o YoY padrão', () => {
    const baked = analyticsFromMonthRow(sampleRow())
    const aligned = overlayCachedPrevious(baked, null, prevWindow)
    expect(aligned.previous.month).toBe('2026-03')
    expect(aligned.previous.label).toContain('Mar/2026')
    expect(aligned.previous.revenue).toBeNull()
  })
})

describe('overviewFromCachedRows', () => {
  it('finance e analytics apontam para o mesmo recorte comparado', () => {
    const month = '2026-08'
    const prevWindow = resolveComparableWindow(resolveMonthWindow(month, '2026-08-13'), '2026-03')
    const cached = sampleRow({
      payload: { analytics: analyticsFromMonthRow(sampleRow()) },
    })
    const overview = overviewFromCachedRows({
      brand: getBrand('brasil'),
      month,
      cached,
      cachedPrev: null,
      prevWindow,
    })
    expect(overview.finance.from).toBe(cached.from_day.slice(0, 10))
    expect(overview.previous_label).toBe(prevWindow.label)
    expect(overview.analytics.previous.month).toBe('2026-03')
    expect(overview.analytics.previous.revenue).toBeNull()
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
