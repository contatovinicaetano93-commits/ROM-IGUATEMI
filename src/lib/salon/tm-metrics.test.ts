import { describe, expect, it } from 'vitest'
import { tmMonthWindows, tmQuarterWindows } from '@/lib/salon/tm-metrics'

describe('tmMonthWindows', () => {
  it('MTD alinha mesmo mês do ano passado no mesmo dia', () => {
    const w = tmMonthWindows('2026-08-07')
    expect(w.current).toMatchObject({
      key: '2026-08',
      start: '2026-08-01',
      end: '2026-08-07',
      mtd: true,
    })
    expect(w.previous).toMatchObject({
      key: '2025-08',
      start: '2025-08-01',
      end: '2025-08-07',
      mtd_aligned: true,
    })
    expect(w.previous.label).toContain('até dia 7')
  })

  it('mês escolhido à mão recorta o mesmo dia', () => {
    const w = tmMonthWindows('2026-08-07', '2026-03')
    expect(w.previous).toMatchObject({
      key: '2026-03',
      start: '2026-03-01',
      end: '2026-03-07',
      mtd_aligned: true,
    })
  })
})

describe('tmQuarterWindows', () => {
  it('Q aberto usa mesmo nº de dias no mesmo Q do ano passado', () => {
    const w = tmQuarterWindows('2026-08-07')
    expect(w.current).toMatchObject({
      key: '2026-Q3',
      start: '2026-07-01',
      end: '2026-08-07',
    })
    expect(w.previous).toMatchObject({
      key: '2025-Q3',
      start: '2025-07-01',
      end: '2025-08-07',
    })
  })
})
