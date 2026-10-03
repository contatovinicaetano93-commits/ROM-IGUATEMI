import { describe, expect, it } from 'vitest'
import {
  avgPerDay,
  buildDailyPerformanceIndex,
  matchVisitKeyToP1,
  meanOf,
  standingFromDelta,
} from '@/lib/salon/daily-performance-index'
import { normalizeProKey } from '@/lib/director-report/match-pro'

describe('daily-performance-index math', () => {
  it('avgPerDay null quando sem dias ou fat', () => {
    expect(avgPerDay(1000, 0)).toBeNull()
    expect(avgPerDay(null, 5)).toBeNull()
    expect(avgPerDay(1000, 5)).toBe(200)
  })

  it('meanOf e standing', () => {
    expect(meanOf([])).toBeNull()
    expect(meanOf([100, 200, 300])).toBe(200)
    expect(standingFromDelta(null)).toBe('sem_base')
    expect(standingFromDelta(0.2)).toBe('neutro')
    expect(standingFromDelta(50)).toBe('acima')
    expect(standingFromDelta(-50)).toBe('abaixo')
  })

  it('matchVisitKeyToP1 casa nome curto com completo', () => {
    const p1 = [
      normalizeProKey('MAURICIO DE CARVALHO LIMA'),
      normalizeProKey('ALISON ALVAREZ'),
    ]
    expect(matchVisitKeyToP1(normalizeProKey('MAURICIO CARVALHO'), p1)).toBe(
      normalizeProKey('MAURICIO DE CARVALHO LIMA'),
    )
    expect(matchVisitKeyToP1(normalizeProKey('ALISON ALVAREZ'), p1)).toBe(
      normalizeProKey('ALISON ALVAREZ'),
    )
  })
})

describe('buildDailyPerformanceIndex', () => {
  it('calcula índice e deltas acima/abaixo', () => {
    const fatByPro = new Map([
      ['Ana Silva', 10000],
      ['Bruno Costa', 4000],
      ['Carla Dias', 6000],
    ])
    const daysByVisitKey = new Map([
      [normalizeProKey('Ana Silva'), 10],
      [normalizeProKey('Bruno Costa'), 10],
      [normalizeProKey('Carla Dias'), 10],
    ])
    // medias: 1000, 400, 600 → índice 666.67
    const out = buildDailyPerformanceIndex({
      month: '2026-09',
      from: '2026-09-01',
      to: '2026-09-30',
      mtd: false,
      referenceDay: '2026-09-30',
      salonOpenDays: 24,
      fatByPro,
      daysByVisitKey,
    })
    expect(out.indice).toBe(666.67)
    expect(out.salon_open_days).toBe(24)
    const ana = out.professionals.find((p) => p.name === 'Ana Silva')
    const bruno = out.professionals.find((p) => p.name === 'Bruno Costa')
    expect(ana?.media_dia_trabalhado).toBe(1000)
    expect(ana?.media_dia_salao).toBe(416.67)
    expect(ana?.standing).toBe('acima')
    expect(bruno?.standing).toBe('abaixo')
    // Ordena por delta desc — Ana primeiro
    expect(out.professionals[0]?.name).toBe('Ana Silva')
  })

  it('não inventa média com 0 dias (KPI null)', () => {
    const out = buildDailyPerformanceIndex({
      month: '2026-09',
      from: '2026-09-01',
      to: '2026-09-30',
      mtd: false,
      referenceDay: '2026-09-30',
      salonOpenDays: 20,
      fatByPro: new Map([['Só Faturou', 5000]]),
      daysByVisitKey: new Map(),
    })
    const row = out.professionals[0]
    expect(row?.media_dia_trabalhado).toBeNull()
    expect(row?.standing).toBe('sem_base')
    expect(out.indice).toBeNull()
  })
})
