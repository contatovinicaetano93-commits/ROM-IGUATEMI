import { describe, expect, it } from 'vitest'
import { tmMonthWindows, tmQuarterWindows } from '@/lib/salon/tm-metrics'

describe('tmMonthWindows', () => {
  it('MTD alinha mês anterior no mesmo dia', () => {
    const w = tmMonthWindows('2026-08-07')
    expect(w.current).toMatchObject({
      key: '2026-08',
      start: '2026-08-01',
      end: '2026-08-07',
      mtd: true,
    })
    expect(w.previous).toMatchObject({
      key: '2026-07',
      start: '2026-07-01',
      end: '2026-07-07',
      mtd_aligned: true,
    })
    expect(w.previous.label).toContain('até dia 7')
  })

  it('fim do mês MTD alinha ao mês anterior completo (dia clampado)', () => {
    const w = tmMonthWindows('2026-07-31')
    expect(w.current).toMatchObject({
      start: '2026-07-01',
      end: '2026-07-31',
      mtd: true,
    })
    expect(w.previous).toMatchObject({
      start: '2026-06-01',
      end: '2026-06-30',
      mtd_aligned: true,
    })
  })
})

describe('tmQuarterWindows', () => {
  it('Q aberto usa mesmo nº de dias no Q anterior', () => {
    // 2026-Q3 começa 01/07; em 07/08 = 38 dias
    const w = tmQuarterWindows('2026-08-07')
    expect(w.current).toMatchObject({
      key: '2026-Q3',
      start: '2026-07-01',
      end: '2026-08-07',
    })
    expect(w.previous).toMatchObject({
      key: '2026-Q2',
      start: '2026-04-01',
      end: '2026-05-08',
    })
    expect(w.previous.label).toContain('38d')
  })

  it('Q2 fechado alinha ao Q1 mais curto (90d), não 91 vs 90', () => {
    // 2026-Q2 = 91d; 2026-Q1 = 90d → ambos em 90d (até 29/06 e 31/03)
    const w = tmQuarterWindows('2026-06-30')
    expect(w.current).toMatchObject({
      key: '2026-Q2',
      start: '2026-04-01',
      end: '2026-06-29',
    })
    expect(w.previous).toMatchObject({
      key: '2026-Q1',
      start: '2026-01-01',
      end: '2026-03-31',
    })
    expect(w.previous.label).toContain('90d')
  })
})
