import { describe, expect, it } from 'vitest'
import { REACTIVATION_WINDOW_DAYS } from '@/lib/salon/reactivation-kpi'

describe('reactivation kpi constants', () => {
  it('usa janela entre 14 e 30 dias', () => {
    expect(REACTIVATION_WINDOW_DAYS).toBeGreaterThanOrEqual(14)
    expect(REACTIVATION_WINDOW_DAYS).toBeLessThanOrEqual(30)
  })
})
