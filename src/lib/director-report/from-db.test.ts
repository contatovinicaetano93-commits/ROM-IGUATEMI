import { describe, expect, it } from 'vitest'
import { isVisitCoverageReady } from './from-db'

describe('isVisitCoverageReady', () => {
  it('exige cobertura não truncada com linhas', () => {
    expect(isVisitCoverageReady(null)).toBe(false)
    expect(
      isVisitCoverageReady({
        period_key: '2026-Q2',
        row_count: 0,
        truncated: false,
        synced_at: '2026-08-03',
      }),
    ).toBe(false)
    expect(
      isVisitCoverageReady({
        period_key: '2026-Q2',
        row_count: 120,
        truncated: true,
        synced_at: '2026-08-03',
      }),
    ).toBe(false)
    expect(
      isVisitCoverageReady({
        period_key: '2026-Q2',
        row_count: 120,
        truncated: false,
        synced_at: '2026-08-03',
      }),
    ).toBe(true)
  })
})
