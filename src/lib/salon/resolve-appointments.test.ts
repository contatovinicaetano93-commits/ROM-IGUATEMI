import { describe, expect, it } from 'vitest'
import { resolveAppointmentsHeads } from '@/lib/salon/resolve-appointments'

describe('resolveAppointmentsHeads', () => {
  it('usa agenda local quando coerente e >= attended', () => {
    expect(resolveAppointmentsHeads({ metricAppt: 10, scheduleHeads: 12, attended: 8 })).toBe(12)
  })

  it('prefere metrics quando maior que CS e >= attended', () => {
    expect(resolveAppointmentsHeads({ metricAppt: 20, scheduleHeads: 12, attended: 8 })).toBe(20)
  })

  it('cai em metrics se CS < attended', () => {
    expect(resolveAppointmentsHeads({ metricAppt: 15, scheduleHeads: 3, attended: 10 })).toBe(15)
  })

  it('nunca fica abaixo de attended', () => {
    expect(resolveAppointmentsHeads({ metricAppt: 2, scheduleHeads: 1, attended: 9 })).toBe(9)
  })
})
