import { describe, expect, it } from 'vitest'
import { formatVisitDate, toSalonDateIso } from './format'

describe('toSalonDateIso', () => {
  it('converte instante perto da meia-noite SP sem usar slice UTC', () => {
    // 2026-07-10 02:30 UTC = 2026-07-09 23:30 em America/Sao_Paulo
    expect(toSalonDateIso('2026-07-10T02:30:00.000Z')).toBe('2026-07-09')
    // 2026-07-10 03:30 UTC = 2026-07-10 00:30 SP
    expect(toSalonDateIso('2026-07-10T03:30:00.000Z')).toBe('2026-07-10')
  })

  it('retorna null para inválido', () => {
    expect(toSalonDateIso(null)).toBeNull()
    expect(toSalonDateIso('não-é-data')).toBeNull()
  })
})

describe('formatVisitDate', () => {
  it('usa fuso America/Sao_Paulo (não UTC do servidor)', () => {
    // 2026-07-10 02:30 UTC = 09/07 em SP
    const formatted = formatVisitDate('2026-07-10T02:30:00.000Z')
    expect(formatted).toMatch(/09/)
    expect(formatted).not.toMatch(/10 de jul/)
  })
})
