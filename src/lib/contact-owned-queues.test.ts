import { describe, expect, it } from 'vitest'
import {
  aggregateOwnedUrgencyFlags,
  totalForUrgencyQueue,
} from '@/lib/contact-owned-urgency'

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

describe('totalForUrgencyQueue', () => {
  const counts = { overdue: 3104, due_soon: 1804, scheduled: 220 }

  it('não usa o limit da página (250) — devolve a contagem real', () => {
    expect(totalForUrgencyQueue(counts, 'overdue')).toBe(3104)
    expect(totalForUrgencyQueue(counts, 'due_soon')).toBe(1804)
    expect(totalForUrgencyQueue(counts, 'scheduled')).toBe(220)
  })
})
