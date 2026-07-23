import { describe, expect, it } from 'vitest'

/** Espelha a lógica de janela do sync de receita (fast=1, full=7). */
function revenueBackfillDays(today: string, mode: 'fast' | 'full'): string[] {
  const daysBack = mode === 'fast' ? 1 : 7
  const [y, m, d] = today.split('-').map(Number)
  const add = (iso: string, delta: number) => {
    const [yy, mm, dd] = iso.split('-').map(Number)
    return new Date(Date.UTC(yy!, mm! - 1, dd! + delta)).toISOString().slice(0, 10)
  }
  const from = add(today, -daysBack)
  const out: string[] = []
  let cur = from
  while (cur <= today) {
    out.push(cur)
    cur = add(cur, 1)
  }
  void y
  void m
  void d
  return out
}

describe('revenue backfill window', () => {
  it('fast cobre hoje e ontem', () => {
    expect(revenueBackfillDays('2026-07-23', 'fast')).toEqual(['2026-07-22', '2026-07-23'])
  })

  it('full cobre 8 dias (7 atrás + hoje)', () => {
    const days = revenueBackfillDays('2026-07-23', 'full')
    expect(days[0]).toBe('2026-07-16')
    expect(days.at(-1)).toBe('2026-07-23')
    expect(days).toHaveLength(8)
  })
})
