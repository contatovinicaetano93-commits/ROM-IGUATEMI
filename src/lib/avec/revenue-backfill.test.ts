import { describe, expect, it } from 'vitest'
import { isIsoDay, yearStartIso } from '@/lib/avec/sync'

describe('revenue backfill helpers', () => {
  it('yearStartIso usa o ano do dia', () => {
    expect(yearStartIso('2026-07-27')).toBe('2026-01-01')
    expect(yearStartIso('2025-12-31')).toBe('2025-01-01')
  })

  it('isIsoDay valida YYYY-MM-DD', () => {
    expect(isIsoDay('2026-01-01')).toBe(true)
    expect(isIsoDay('2026-1-1')).toBe(false)
    expect(isIsoDay('hoje')).toBe(false)
  })
})
