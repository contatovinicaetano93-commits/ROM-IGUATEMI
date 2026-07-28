import { describe, expect, it } from 'vitest'
import { isP3NonReturnerRow, normalizeP3ReturnRateRow } from '@/lib/avec/normalize'

describe('P3 return rate row parsing (ausentes)', () => {
  it('detecta taxa explícita', () => {
    expect(normalizeP3ReturnRateRow({ taxa_retorno: '42%' })).toBeCloseTo(0.42)
  })

  it('detecta lista de não-retorno sem taxa', () => {
    const row = { cliente: 'Maria Silva', telefone: '11999990000' }
    expect(normalizeP3ReturnRateRow(row)).toBeNull()
    expect(isP3NonReturnerRow(row)).toBe(true)
  })
})
