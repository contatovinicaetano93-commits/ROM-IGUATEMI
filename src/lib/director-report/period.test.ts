import { describe, expect, it } from 'vitest'
import {
  currentQuarterKeySp,
  currentYearSp,
  isHistoricalDirectorPeriod,
} from './period'

describe('isHistoricalDirectorPeriod', () => {
  it('marca 2025 como histórico quando o calendário SP já está em 2026+', () => {
    const now = new Date('2026-07-30T15:00:00.000Z')
    expect(currentYearSp(now)).toBe(2026)
    expect(
      isHistoricalDirectorPeriod({ month: '2025-06', quarter: '2025-Q2' }, now),
    ).toBe(true)
  })

  it('marca trimestre fechado do ano corrente como full-budget', () => {
    const now = new Date('2026-08-03T18:00:00.000Z')
    expect(currentQuarterKeySp(now)).toBe('2026-Q3')
    expect(
      isHistoricalDirectorPeriod(
        { quarter: '2026-Q2', compare: '2026-Q1', stage: '0011' },
        now,
      ),
    ).toBe(true)
  })

  it('trimestre aberto corrente sozinho pode ficar slim', () => {
    const now = new Date('2026-08-03T18:00:00.000Z')
    expect(
      isHistoricalDirectorPeriod(
        { quarter: '2026-Q3', compare: '2026-Q3', stage: '0011' },
        now,
      ),
    ).toBe(false)
  })

  it('marca full-budget se o comparativo for trimestre fechado', () => {
    const now = new Date('2026-08-03T18:00:00.000Z')
    expect(
      isHistoricalDirectorPeriod(
        { quarter: '2026-Q3', compare: '2026-Q2', stage: '0011' },
        now,
      ),
    ).toBe(true)
  })

  it('marca histórico se qualquer chave de período for de ano anterior', () => {
    const now = new Date('2026-03-01T12:00:00.000Z')
    expect(
      isHistoricalDirectorPeriod(
        { month: '2026-03', quarter: '2026-Q1', compare: '2025-Q4' },
        now,
      ),
    ).toBe(true)
  })

  it('stage 0021 ignora trimestre 0011 histórico da outra aba', () => {
    const now = new Date('2026-08-03T18:00:00.000Z')
    expect(
      isHistoricalDirectorPeriod(
        {
          month: '2026-08',
          quarter0021: '2026-Q3',
          quarter: '2025-Q4',
          compare: '2025-Q3',
          stage: '0021',
          compareMonths: false,
        },
        now,
      ),
    ).toBe(false)
  })

  it('stage 0011 ignora mês 0021 histórico', () => {
    const now = new Date('2026-08-03T18:00:00.000Z')
    expect(
      isHistoricalDirectorPeriod(
        {
          month: '2025-06',
          quarter: '2026-Q3',
          compare: '2026-Q3',
          stage: '0011',
        },
        now,
      ),
    ).toBe(false)
  })

  it('compareMonths=false ignora compare0021 histórico', () => {
    const now = new Date('2026-08-03T18:00:00.000Z')
    expect(
      isHistoricalDirectorPeriod(
        {
          month: '2026-08',
          quarter0021: '2026-Q3',
          compare0021: '2025-Q4',
          stage: '0021',
          compareMonths: false,
        },
        now,
      ),
    ).toBe(false)
  })
})
