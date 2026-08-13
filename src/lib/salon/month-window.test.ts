import { describe, expect, it } from 'vitest'
import {
  resolveMonthWindow,
  resolveComparableWindow,
  resolvePreviousComparableWindow,
  yearAgoMonthKey,
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

describe('yearAgoMonthKey', () => {
  it('volta 12 meses', () => {
    expect(yearAgoMonthKey('2026-08')).toBe('2025-08')
    expect(yearAgoMonthKey('2026-01')).toBe('2025-01')
  })
})

describe('resolveComparableWindow', () => {
  it('padrão MTD = mesmo mês ano passado até o mesmo dia', () => {
    const current = resolveMonthWindow('2026-08', '2026-08-13')
    expect(resolveComparableWindow(current)).toEqual({
      month: '2025-08',
      from: '2025-08-01',
      to: '2025-08-13',
      label: 'Ago/2025 (até dia 13)',
      mtd_aligned: true,
    })
  })

  it('mês fechado compara com o mesmo mês ano passado cheio', () => {
    const current = resolveMonthWindow('2026-06', '2026-08-13')
    expect(resolveComparableWindow(current)).toEqual({
      month: '2025-06',
      from: '2025-06-01',
      to: '2025-06-30',
      label: 'Jun/2025',
      mtd_aligned: false,
    })
  })

  it('mês escolhido à mão também recorta o mesmo dia quando o base está aberto', () => {
    const current = resolveMonthWindow('2026-08', '2026-08-13')
    expect(resolveComparableWindow(current, '2026-03')).toEqual({
      month: '2026-03',
      from: '2026-03-01',
      to: '2026-03-13',
      label: 'Mar/2026 (até dia 13)',
      mtd_aligned: true,
    })
  })

  it('clampa dia 31 em fevereiro', () => {
    const current = resolveMonthWindow('2026-03', '2026-03-31')
    expect(resolveComparableWindow(current, '2026-02')).toMatchObject({
      month: '2026-02',
      from: '2026-02-01',
      to: '2026-02-28',
      mtd_aligned: true,
    })
  })

  it('alias resolvePreviousComparableWindow agora é YoY', () => {
    const current = resolveMonthWindow('2026-07', '2026-07-28')
    expect(resolvePreviousComparableWindow(current).month).toBe('2025-07')
  })
})
