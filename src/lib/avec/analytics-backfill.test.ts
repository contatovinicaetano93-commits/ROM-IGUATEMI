import { describe, expect, it } from 'vitest'
import { monthsNeedingAnalyticsBackfill } from '@/lib/avec/analytics-backfill'

describe('monthsNeedingAnalyticsBackfill', () => {
  it('lista Jan–mês anterior ao referência', () => {
    expect(monthsNeedingAnalyticsBackfill({ referenceDay: '2026-07-27' })).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
    ])
  })

  it('respeita throughMonth', () => {
    expect(
      monthsNeedingAnalyticsBackfill({
        referenceDay: '2026-07-27',
        throughMonth: '2026-03',
      }),
    ).toEqual(['2026-01', '2026-02', '2026-03'])
  })

  it('em janeiro lista o ano anterior até dezembro', () => {
    expect(monthsNeedingAnalyticsBackfill({ referenceDay: '2026-01-15' })).toEqual([
      '2025-01',
      '2025-02',
      '2025-03',
      '2025-04',
      '2025-05',
      '2025-06',
      '2025-07',
      '2025-08',
      '2025-09',
      '2025-10',
      '2025-11',
      '2025-12',
    ])
  })
})
