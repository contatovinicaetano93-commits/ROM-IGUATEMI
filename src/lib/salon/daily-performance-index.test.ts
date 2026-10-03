import { describe, expect, it } from 'vitest'
import {
  avgPerDay,
  buildDailyPerformanceIndex,
  constanciaPct,
  deltaVsMediaDias,
  mapCategoriaByP1Name,
  mapFatBrutoByP1Name,
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

  it('deltaVsMediaDias = (dias ÷ média − 1) × 100', () => {
    expect(deltaVsMediaDias(null, 18)).toBeNull()
    expect(deltaVsMediaDias(24, 0)).toBeNull()
    expect(deltaVsMediaDias(24, 18)).toBe(33.3)
    expect(deltaVsMediaDias(12, 18)).toBe(-33.3)
    expect(deltaVsMediaDias(18, 18)).toBe(0)
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

  it('mapCategoriaByP1Name usa cargo 8123', () => {
    const map = mapCategoriaByP1Name(
      ['MAURICIO DE CARVALHO LIMA', 'Ana Silva'],
      [
        { name: 'MAURICIO CARVALHO', role: 'Cabeleireiro' },
        { name: 'Ana Silva', role: 'Manicure' },
        { name: 'Sem Cargo', role: null },
      ],
    )
    expect(map.get('MAURICIO DE CARVALHO LIMA')).toBe('Cabeleireiro')
    expect(map.get('Ana Silva')).toBe('Manicure')
    expect(map.has('Sem Cargo')).toBe(false)
  })

  it('mapFatBrutoByP1Name usa charged 8123 (não inventa 0)', () => {
    const map = mapFatBrutoByP1Name(
      ['MAURICIO DE CARVALHO LIMA', 'Ana Silva', 'Só P1'],
      [
        { name: 'MAURICIO CARVALHO', charged: 42_940.12 },
        { name: 'Ana Silva', charged: 0 },
        { name: 'Ana Silva', charged: null },
        { name: 'Fantasma', charged: 9_999 },
      ],
    )
    expect(map.get('MAURICIO DE CARVALHO LIMA')).toBe(42_940.12)
    expect(map.has('Ana Silva')).toBe(false)
    expect(map.has('Só P1')).toBe(false)
    expect(map.has('Fantasma')).toBe(false)
  })
})

describe('buildDailyPerformanceIndex', () => {
  it('índice = média constâncias; Δ = % vs média de dias', () => {
    // 24 dias úteis: Ana 24, Bruno 12, Carla 18 → média dias 18; índice constância 75%
    // Δ Ana = (24/18−1)×100 = +33,3%; Bruno −33,3%; Carla 0%
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
      categoriaByPro: new Map([
        ['Ana Silva', 'Cabeleireiro'],
        ['Bruno Costa', 'Assistente'],
      ]),
    })
    expect(out.media_dias_trabalhados).toBe(18)
    expect(out.indice).toBe(75)
    expect(out.salon_open_days).toBe(24)
    const ana = out.professionals.find((p) => p.name === 'Ana Silva')
    const bruno = out.professionals.find((p) => p.name === 'Bruno Costa')
    const carla = out.professionals.find((p) => p.name === 'Carla Dias')
    expect(ana?.categoria).toBe('Cabeleireiro')
    expect(bruno?.categoria).toBe('Assistente')
    expect(carla?.categoria).toBeNull()
    expect(ana?.constancia_pct).toBe(100)
    expect(ana?.delta_indice).toBe(33.3)
    expect(ana?.standing).toBe('acima')
    expect(bruno?.constancia_pct).toBe(50)
    expect(bruno?.delta_indice).toBe(-33.3)
    expect(bruno?.standing).toBe('abaixo')
    expect(carla?.delta_indice).toBe(0)
    expect(carla?.standing).toBe('neutro')
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

  it('fat_bruto 8123 → R$/dia veio; 0 placeholder vira null', () => {
    const out = buildDailyPerformanceIndex({
      month: '2026-09',
      from: '2026-09-01',
      to: '2026-09-30',
      mtd: false,
      referenceDay: '2026-09-30',
      salonOpenDays: 30,
      fatByPro: new Map([
        ['Leda', 11_940],
        ['Alcibelle', 0],
      ]),
      daysByVisitKey: new Map([
        [normalizeProKey('Leda'), 30],
        [normalizeProKey('Alcibelle'), 29],
      ]),
    })
    const leda = out.professionals.find((p) => p.name === 'Leda')
    const alci = out.professionals.find((p) => p.name === 'Alcibelle')
    expect(leda?.fat_bruto).toBe(11_940)
    expect(leda?.media_dia_trabalhado).toBe(398)
    expect(alci?.fat_bruto).toBeNull()
    expect(alci?.media_dia_trabalhado).toBeNull()
    expect(alci?.dias_trabalhados).toBe(29)
  })
})
