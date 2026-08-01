import { describe, expect, it, vi, beforeEach } from 'vitest'

const sqlMock = vi.fn()
const getSalonP1DailyNear = vi.fn()
const getSalonP2DailyNear = vi.fn()
const getSalonP3DailyNear = vi.fn()

vi.mock('@/lib/db', () => ({
  getSql: () => sqlMock,
}))

vi.mock('@/lib/salon/p1-metrics', () => ({
  getSalonP1DailyNear: (...args: unknown[]) => getSalonP1DailyNear(...args),
}))

vi.mock('@/lib/salon/p2-metrics', () => ({
  getSalonP2DailyNear: (...args: unknown[]) => getSalonP2DailyNear(...args),
}))

vi.mock('@/lib/salon/p3-metrics', () => ({
  getSalonP3DailyNear: (...args: unknown[]) => getSalonP3DailyNear(...args),
}))

describe('period-analytics', () => {
  beforeEach(() => {
    sqlMock.mockReset()
    getSalonP1DailyNear.mockReset().mockResolvedValue(null)
    getSalonP2DailyNear.mockReset().mockResolvedValue(null)
    getSalonP3DailyNear.mockReset().mockResolvedValue(null)
  })

  it('pondera ocupação e estima receita perdida', async () => {
    const { averageOccupancy, coerceOccupancyFraction, estimateLostRevenue, monthToDateRange } =
      await import('@/lib/salon/period-analytics')
    expect(
      averageOccupancy([
        { name: 'A', revenue: 100, attended: 10, ticket_avg: 10, occupancy: 0.8 },
        { name: 'B', revenue: 50, attended: 0, ticket_avg: 0, occupancy: 0.2 },
      ]),
    ).toBe(0.8)
    expect(coerceOccupancyFraction(1.063)).toBeCloseTo(1.063)
    expect(coerceOccupancyFraction(67.79)).toBeCloseTo(0.6779)
    expect(estimateLostRevenue(2, 3, 100)).toBe(500)
    expect(monthToDateRange('2026-07', '2026-07-26')).toEqual({
      from: '2026-07-01',
      to: '2026-07-26',
    })
  })

  it('monta bucket comercial do período', async () => {
    sqlMock
      // *_days > 0 = há dia conhecido; sem isso sumPeriodBase devolve null.
      .mockResolvedValueOnce([{ revenue: 10000, attended: 50, revenue_days: 1, attended_days: 1 }])
      .mockResolvedValueOnce([{ cancelled: 2, no_shows: 3 }])
      .mockResolvedValueOnce([{ revenue: 8000, attended: 40, revenue_days: 1, attended_days: 1 }])
      .mockResolvedValueOnce([{ cancelled: 1, no_shows: 1 }])
    getSalonP1DailyNear.mockResolvedValue({
      day: '2026-07-31',
      professionals: [
        { name: 'Ana', revenue: 1000, attended: 10, ticket_avg: 100, occupancy: 0.7 },
      ],
      services: [{ name: 'Corte', quantity: 5, revenue: 500 }],
      acquisition: [{ channel: 'Instagram', clients: 4 }],
      reactivation_count: 0,
      updated_at: 'now',
    })
    getSalonP2DailyNear.mockResolvedValue({
      day: '2026-07-31',
      booking_channels: [{ channel: 'WhatsApp', count: 12 }],
      packages: [{ name: 'Pacote 5x', quantity: 2, revenue: 800 }],
      packages_sold: 2,
      ratings_avg: 0,
      ratings_count: 0,
      payment_mix: [],
      birthday_count: 0,
      updated_at: 'now',
    })
    getSalonP3DailyNear.mockResolvedValue({
      day: '2026-07-31',
      return_rate: 0.42,
      new_clients_period: 18,
      revenue_curve: [],
      updated_at: 'now',
    })

    const { computePeriodAnalytics } = await import('@/lib/salon/period-analytics')
    const result = await computePeriodAnalytics({ month: '2026-07' })

    expect(result.label).toBe('Jul/2026')
    expect(result.revenue).toBe(10000)
    expect(result.attended).toBe(50)
    expect(result.occupancy_avg).toBe(0.7)
    expect(result.lost_revenue).toBe(1000)
    expect(result.packages_revenue).toBe(800)
    expect(result.booking_channels[0]?.channel).toBe('WhatsApp')
    expect(result.new_clients_period).toBe(18)
    expect(result.return_rate).toBe(0.42)
    expect(result.previous.month).toBe('2026-06')
    expect(result.previous.revenue).toBe(8000)
    expect(result.previous.attended).toBe(40)
    expect(result.previous.lost_revenue).toBe(400)
    expect(result.previous.occupancy_avg).toBe(0.7)
  })
})
