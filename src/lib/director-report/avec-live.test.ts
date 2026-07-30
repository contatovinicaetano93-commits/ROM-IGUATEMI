import { describe, expect, it } from 'vitest'
import { monthRangeBr, quarterRangeBr } from './avec-live'

describe('monthRangeBr', () => {
  it('usa mês calendário cheio para mês fechado', () => {
    expect(monthRangeBr('2026-02', '2026-07-15')).toEqual({ inicio: '01/02/2026', fim: '28/02/2026' })
    expect(monthRangeBr('2026-03', '2026-07-15')).toEqual({ inicio: '01/03/2026', fim: '31/03/2026' })
  })

  it('usa MTD no mês corrente', () => {
    expect(monthRangeBr('2026-07', '2026-07-15')).toEqual({ inicio: '01/07/2026', fim: '15/07/2026' })
  })
})

describe('quarterRangeBr', () => {
  it('cobre os 3 meses do trimestre', () => {
    expect(quarterRangeBr('2026-Q1')).toEqual({ inicio: '01/01/2026', fim: '31/03/2026' })
  })
})
