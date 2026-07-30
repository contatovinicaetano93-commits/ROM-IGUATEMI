import { describe, expect, it } from 'vitest'
import {
  resolveMonthWindow,
  resolvePreviousComparableWindow,
} from '@/lib/salon/month-window'

describe('resolveMonthWindow', () => {
  it('mês fechado usa 1º→último dia', () => {
    expect(resolveMonthWindow('2026-04', '2026-07-27')).toEqual({
      month: '2026-04',
      from: '2026-04-01',
      to: '2026-04-30',
      mtd: false,
    })
  })

  it('mês corrente é MTD até referenceDay', () => {
    expect(resolveMonthWindow('2026-07', '2026-07-27')).toEqual({
      month: '2026-07',
      from: '2026-07-01',
      to: '2026-07-27',
      mtd: true,
    })
  })
})

describe('resolvePreviousComparableWindow', () => {
  it('MTD corta o mês anterior no mesmo dia', () => {
    const current = resolveMonthWindow('2026-07', '2026-07-28')
    expect(resolvePreviousComparableWindow(current)).toEqual({
      month: '2026-06',
      from: '2026-06-01',
      to: '2026-06-28',
      label: 'Jun/2026 (até dia 28)',
      mtd_aligned: true,
    })
  })

  it('mês fechado compara com mês anterior cheio', () => {
    const current = resolveMonthWindow('2026-06', '2026-07-28')
    expect(resolvePreviousComparableWindow(current)).toEqual({
      month: '2026-05',
      from: '2026-05-01',
      to: '2026-05-31',
      label: 'Mai/2026',
      mtd_aligned: false,
    })
  })
})
