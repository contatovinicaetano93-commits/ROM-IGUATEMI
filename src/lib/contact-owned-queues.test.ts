import { describe, expect, it } from 'vitest'

/**
 * Espelha a regra de countOwnedUrgencyQueues (exclusivo overdue → due_soon;
 * scheduled é independente).
 */
function countFromFlags(
  rows: { overdue: number; due_soon: number; scheduled_soon: number }[],
) {
  let overdue = 0
  let due_soon = 0
  let scheduled = 0
  for (const u of rows) {
    if (u.overdue > 0) overdue += 1
    else if (u.due_soon > 0) due_soon += 1
    if (u.scheduled_soon > 0) scheduled += 1
  }
  return { overdue, due_soon, scheduled }
}

describe('countOwnedUrgencyQueues rules', () => {
  it('conta Atrasados e Vencendo exclusivos', () => {
    expect(
      countFromFlags([
        { overdue: 2, due_soon: 1, scheduled_soon: 0 },
        { overdue: 0, due_soon: 1, scheduled_soon: 0 },
        { overdue: 0, due_soon: 0, scheduled_soon: 1 },
        { overdue: 0, due_soon: 0, scheduled_soon: 0 },
      ]),
    ).toEqual({ overdue: 1, due_soon: 1, scheduled: 1 })
  })

  it('não zera Atrasados quando a lista tem overdue', () => {
    const rows = [
      { overdue: 1, due_soon: 0, scheduled_soon: 0 },
      { overdue: 3, due_soon: 0, scheduled_soon: 0 },
    ]
    const counts = countFromFlags(rows)
    expect(counts.overdue).toBe(2)
    expect(counts.due_soon).toBe(0)
  })
})
