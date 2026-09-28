import { describe, expect, it } from 'vitest'
import {
  conditionLabel,
  isIsoDay,
  isIsoMonth,
  normalizeStartTime,
  parseAtivacaoCondition,
} from '@/lib/ativacoes/types'

describe('ativacoes types', () => {
  it('parseia condição', () => {
    expect(parseAtivacaoCondition('comercial')).toBe('comercial')
    expect(parseAtivacaoCondition('servicos')).toBe('servicos')
    expect(parseAtivacaoCondition('outra')).toBeNull()
  })

  it('normaliza horário de início', () => {
    expect(normalizeStartTime('09:30')).toBe('09:30')
    expect(normalizeStartTime('09:30:00')).toBe('09:30')
    expect(normalizeStartTime('25:00')).toBeNull()
    expect(normalizeStartTime('')).toBeNull()
  })

  it('valida dia e mês ISO', () => {
    expect(isIsoDay('2026-09-28')).toBe(true)
    expect(isIsoDay('2026-9-28')).toBe(false)
    expect(isIsoMonth('2026-09')).toBe(true)
    expect(isIsoMonth('2026-9')).toBe(false)
  })

  it('rótulos de condição', () => {
    expect(conditionLabel('comercial')).toBe('Condição comercial')
    expect(conditionLabel('servicos')).toBe('Condição de serviços')
  })
})
