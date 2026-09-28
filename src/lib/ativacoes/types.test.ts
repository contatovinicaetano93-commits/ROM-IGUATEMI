import { describe, expect, it } from 'vitest'
import {
  conditionLabel,
  isEndOnOrAfterStart,
  isIsoDay,
  isIsoMonth,
  normalizeClockTime,
  normalizeStartTime,
  parseAtivacaoCondition,
  unitLabel,
} from '@/lib/ativacoes/types'

describe('ativacoes types', () => {
  it('parseia condição', () => {
    expect(parseAtivacaoCondition('comercial')).toBe('comercial')
    expect(parseAtivacaoCondition('servicos')).toBe('servicos')
    expect(parseAtivacaoCondition('outra')).toBeNull()
  })

  it('normaliza horário', () => {
    expect(normalizeClockTime('09:30')).toBe('09:30')
    expect(normalizeClockTime('09:30:00')).toBe('09:30')
    expect(normalizeStartTime('09:30:00')).toBe('09:30')
    expect(normalizeClockTime('25:00')).toBeNull()
    expect(normalizeClockTime('')).toBeNull()
  })

  it('aceita fim igual ou depois do início', () => {
    expect(isEndOnOrAfterStart('10:00', '10:00')).toBe(true)
    expect(isEndOnOrAfterStart('10:00', '12:00')).toBe(true)
    expect(isEndOnOrAfterStart('12:00', '10:00')).toBe(false)
  })

  it('valida dia e mês ISO', () => {
    expect(isIsoDay('2026-09-28')).toBe(true)
    expect(isIsoDay('2026-9-28')).toBe(false)
    expect(isIsoMonth('2026-09')).toBe(true)
    expect(isIsoMonth('2026-9')).toBe(false)
  })

  it('rótulos', () => {
    expect(conditionLabel('comercial')).toBe('Condição comercial')
    expect(conditionLabel('servicos')).toBe('Condição de serviços')
    expect(unitLabel('brasil')).toBe('Brasil')
    expect(unitLabel('iguatemi')).toBe('Iguatemi')
  })
})
