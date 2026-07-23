import { describe, expect, it } from 'vitest'
import {
  computeMonthCompleteness,
  listDaysInclusive,
  statusLabelPt,
} from '@/lib/salon/month-metrics'

describe('listDaysInclusive', () => {
  it('lista dias do intervalo', () => {
    expect(listDaysInclusive('2026-07-01', '2026-07-03')).toEqual([
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
    ])
  })
})

describe('computeMonthCompleteness', () => {
  it('marca mês passado completo sem buracos', () => {
    const days = listDaysInclusive('2026-06-01', '2026-06-30')
    const c = computeMonthCompleteness('2026-06', days, '2026-07-15')
    expect(c.status).toBe('complete')
    expect(c.days_missing).toEqual([])
    expect(c.days_expected).toBe(30)
  })

  it('marca INCOMPLETO quando falta dia em mês fechado', () => {
    const days = listDaysInclusive('2026-06-01', '2026-06-30').filter((d) => d !== '2026-06-15')
    const c = computeMonthCompleteness('2026-06', days, '2026-07-15')
    expect(c.status).toBe('incomplete')
    expect(c.days_missing).toEqual(['2026-06-15'])
    expect(statusLabelPt(c.status)).toBe('INCOMPLETO')
  })

  it('mês atual sem buracos fica em andamento', () => {
    const days = listDaysInclusive('2026-07-01', '2026-07-22')
    const c = computeMonthCompleteness('2026-07', days, '2026-07-23')
    expect(c.status).toBe('in_progress')
    expect(c.check_through).toBe('2026-07-22')
    expect(c.days_missing).toEqual([])
  })

  it('mês atual com buraco fica incompleto', () => {
    const days = listDaysInclusive('2026-07-01', '2026-07-22').filter((d) => d !== '2026-07-10')
    const c = computeMonthCompleteness('2026-07', days, '2026-07-23')
    expect(c.status).toBe('incomplete')
    expect(c.days_missing).toContain('2026-07-10')
  })
})
