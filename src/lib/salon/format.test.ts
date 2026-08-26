import { describe, expect, it } from 'vitest'
import { fmtScheduleParts, toSalonDateIso, toSortableIso, whatsAppUrl } from './format'

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

describe('toSortableIso', () => {
  it('normaliza Date do postgres.js e string', () => {
    expect(toSortableIso(new Date('2026-08-08T13:00:00.000Z'))).toBe('2026-08-08T13:00:00.000Z')
    expect(toSortableIso('2026-08-08T13:00:00.000Z')).toBe('2026-08-08T13:00:00.000Z')
    expect(toSortableIso(null)).toBe('')
  })
})

describe('whatsAppUrl', () => {
  it('prefixa 55 em celular BR local', () => {
    expect(whatsAppUrl('(11) 99999-8888')).toBe('https://wa.me/5511999998888')
  })

  it('não prefixa 55 em E.164 com DDI explícito (+1)', () => {
    expect(whatsAppUrl('+17866224690')).toBe('https://wa.me/17866224690')
  })

  it('mantém BR já com DDI', () => {
    expect(whatsAppUrl('+5511999998888')).toBe('https://wa.me/5511999998888')
  })
})

describe('fmtScheduleParts', () => {
  it('date usa o dia do fuso SP, não o UTC', () => {
    // 2026-07-10 02:30 UTC = 2026-07-09 23:30 SP — o dia UTC daria 10/07.
    expect(fmtScheduleParts('2026-07-10T02:30:00.000Z').date).toBe('09/07')
    // 2026-07-10 03:30 UTC = 2026-07-10 00:30 SP
    expect(fmtScheduleParts('2026-07-10T03:30:00.000Z').date).toBe('10/07')
  })

  it('date é sempre absoluta, mesmo quando day vira "Hoje"', () => {
    const agora = new Date()
    const parts = fmtScheduleParts(agora.toISOString())
    expect(parts.day).toBe('Hoje')
    expect(parts.date).toMatch(/^\d{2}\/\d{2}$/)
  })
})
