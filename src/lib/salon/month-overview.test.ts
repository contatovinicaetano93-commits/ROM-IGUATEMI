import { describe, expect, it } from 'vitest'
import {
  analyticsFromMonthPayload,
  analyticsFromMonthRow,
} from '@/lib/salon/month-overview'
import type { SalonMonthMetricsRow } from '@/lib/salon/month-metrics'

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
    expect(a.new_clients_period).toBe(5)
  })
})
