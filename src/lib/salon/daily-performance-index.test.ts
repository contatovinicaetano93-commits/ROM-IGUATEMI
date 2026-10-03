import { describe, expect, it } from 'vitest'
import {
  avgPerDay,
  buildDailyPerformanceIndex,
  constanciaPct,
  matchVisitKeyToP1,
  meanOf,
  meanPct,
  standingFromDelta,
} from '@/lib/salon/daily-performance-index'
import { normalizeProKey } from '@/lib/director-report/match-pro'

describe('daily-performance-index math', () => {
  it('avgPerDay null quando sem dias ou fat', () => {
    expect(avgPerDay(1000, 0)).toBeNull()
    expect(avgPerDay(null, 5)).toBeNull()
    expect(avgPerDay(1000, 5)).toBe(200)
  })

  it('constanciaPct = dias veio ÷ dias úteis', () => {
    expect(constanciaPct(null, 24)).toBeNull()
    expect(constanciaPct(12, 0)).toBeNull()
    expect(constanciaPct(12, 24)).toBe(50)
    expect(constanciaPct(24, 24)).toBe(100)
    expect(constanciaPct(30, 24)).toBe(100) // cap
  })

  it('meanOf, meanPct e standing', () => {
    expect(meanOf([])).toBeNull()
    expect(meanOf([100, 200, 300])).toBe(200)
    expect(meanPct([50, 100])).toBe(75)
    expect(standingFromDelta(null)).toBe('sem_base')
    expect(standingFromDelta(0.2)).toBe('neutro')
    expect(standingFromDelta(5)).toBe('acima')
    expect(standingFromDelta(-5)).toBe('abaixo')
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
  it('índice = média das constâncias; Δ em pp', () => {
    // 24 dias úteis: Ana 24→100%, Bruno 12→50%, Carla 18→75% → índice 75%
    const fatByPro = new Map([
      ['Ana Silva', 10000],
      ['Bruno Costa', 4000],
      ['Carla Dias', 6000],
    ])
    const daysByVisitKey = new Map([
      [normalizeProKey('Ana Silva'), 24],
      [normalizeProKey('Bruno Costa'), 12],
      [normalizeProKey('Carla Dias'), 18],
    ])
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
    expect(out.media_dias_trabalhados).toBe(18)
    expect(out.indice).toBe(75)
    expect(out.salon_open_days).toBe(24)
    const ana = out.professionals.find((p) => p.name === 'Ana Silva')
    const bruno = out.professionals.find((p) => p.name === 'Bruno Costa')
    expect(ana?.constancia_pct).toBe(100)
    expect(ana?.delta_indice).toBe(25)
    expect(ana?.standing).toBe('acima')
    expect(bruno?.constancia_pct).toBe(50)
    expect(bruno?.delta_indice).toBe(-25)
    expect(bruno?.standing).toBe('abaixo')
    // Ordena por delta desc — Ana primeiro
    expect(out.professionals[0]?.name).toBe('Ana Silva')
  })

  it('sem dias veio → sem constância (KPI null)', () => {
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
    expect(row?.constancia_pct).toBeNull()
    expect(row?.delta_indice).toBeNull()
    expect(row?.standing).toBe('sem_base')
    expect(out.indice).toBeNull()
    expect(out.media_dias_trabalhados).toBeNull()
  })
})
