import { describe, expect, it } from 'vitest'
import { aggregateOwnedUrgencyFlags } from '@/lib/contact-owned-urgency'

describe('aggregateOwnedUrgencyFlags', () => {
  it('conta Atrasados e Vencendo exclusivos', () => {
    expect(
      aggregateOwnedUrgencyFlags([
        { overdue: 2, due_soon: 1, scheduled_soon: 0 },
        { overdue: 0, due_soon: 1, scheduled_soon: 0 },
        { overdue: 0, due_soon: 0, scheduled_soon: 1 },
        { overdue: 0, due_soon: 0, scheduled_soon: 0 },
      ]),
    ).toEqual({ overdue: 1, due_soon: 1, scheduled: 1 })
  })

  it('não zera Atrasados quando a lista tem overdue', () => {
    const counts = aggregateOwnedUrgencyFlags([
      { overdue: 1, due_soon: 0, scheduled_soon: 0 },
      { overdue: 3, due_soon: 0, scheduled_soon: 0 },
    ])
    expect(counts.overdue).toBe(2)
    expect(counts.due_soon).toBe(0)
  })

  it('lista vazia → zeros (não inventa KPI)', () => {
    expect(aggregateOwnedUrgencyFlags([])).toEqual({
      overdue: 0,
      due_soon: 0,
      scheduled: 0,
    })
  })
})
