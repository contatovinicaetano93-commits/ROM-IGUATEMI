import { describe, expect, it } from 'vitest'
import { fmtSignedCurrency, fmtSignedNumber, momCompareLine } from '@/lib/salon/mom-delta'

describe('mom-delta', () => {
  it('formata sinais tipográficos', () => {
    expect(fmtSignedCurrency(-172365.1)).toMatch(/^−/)
    expect(fmtSignedCurrency(100)).toMatch(/^\+/)
    expect(fmtSignedNumber(-12)).toBe('−12')
  })

  it('inverte positivo quando menor é melhor', () => {
    const down = momCompareLine(100, 200, 'Jun/2026', { invertGood: true })
    expect(down?.positive).toBe(true)
    const up = momCompareLine(300, 200, 'Jun/2026', { invertGood: true })
    expect(up?.positive).toBe(false)
  })

  it('receita sobe = verde', () => {
    const line = momCompareLine(3000, 2000, 'Jun/2026')
    expect(line?.positive).toBe(true)
    expect(line?.text).toContain('vs Jun/2026')
  })
})
