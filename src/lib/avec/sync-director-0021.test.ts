import { describe, expect, it } from 'vitest'
import {
  director0021MonthWindow,
  isDirector0021MonthKey,
} from '@/lib/avec/sync-director-0021'

describe('isDirector0021MonthKey', () => {
  it('aceita YYYY-MM válido', () => {
    expect(isDirector0021MonthKey('2025-01')).toBe(true)
    expect(isDirector0021MonthKey('2026-08')).toBe(true)
  })

  it('rejeita formatos inválidos', () => {
    expect(isDirector0021MonthKey('2026-Q1')).toBe(false)
    expect(isDirector0021MonthKey('2026-13')).toBe(false)
    expect(isDirector0021MonthKey('')).toBe(false)
  })
})

describe('director0021MonthWindow', () => {
  it('retorna intervalo dd/mm/yyyy do mês calendário fechado', () => {
    const w = director0021MonthWindow('2025-01')
    expect(w.inicio).toMatch(/^\d{2}\/\d{2}\/2025$/)
    expect(w.fim).toMatch(/^\d{2}\/\d{2}\/2025$/)
    expect(w.inicio).toBe('01/01/2025')
    expect(w.fim).toBe('31/01/2025')
  })
})
