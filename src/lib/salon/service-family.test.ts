import { describe, expect, it } from 'vitest'
import {
  isBlankOrPlaceholderFamily,
  normalizeServiceFamilyKey,
  serviceFamilyLabel,
  serviceFamilyMatches,
} from './service-family'

describe('normalizeServiceFamilyKey', () => {
  it('tira preço Avec do nome', () => {
    expect(normalizeServiceFamilyKey('CORTE - 500,00')).toBe('corte')
    expect(normalizeServiceFamilyKey('CORTE  - 400,00')).toBe('corte')
    expect(normalizeServiceFamilyKey('REFLEXO - 1390,00')).toBe('reflexo')
    expect(normalizeServiceFamilyKey('REFLEXO 1900,00')).toBe('reflexo')
    expect(normalizeServiceFamilyKey('COLORAÇAO - 430,00')).toBe('coloracao')
    expect(normalizeServiceFamilyKey('ESCOVA - 250,00')).toBe('escova')
    expect(normalizeServiceFamilyKey('ALINHAMENTO - 600,00')).toBe('alinhamento')
  })

  it('mantém famílias sem preço', () => {
    expect(normalizeServiceFamilyKey('CORTE CONSULTORIA MAURI')).toBe('corte consultoria mauri')
    expect(normalizeServiceFamilyKey('Atendimento')).toBe('atendimento')
  })
})

describe('serviceFamilyMatches', () => {
  it('casa SKU com preço na família', () => {
    expect(serviceFamilyMatches('CORTE - 500,00', 'corte')).toBe(true)
    expect(serviceFamilyMatches('REFLEXO - 1390,00', 'reflexo')).toBe(true)
  })

  it('não mistura famílias distintas', () => {
    expect(serviceFamilyMatches('CORTE CONSULTORIA MAURI', 'corte')).toBe(false)
    expect(serviceFamilyMatches('CORTE - 380,00', 'corte consultoria mauri')).toBe(false)
  })
})

describe('serviceFamilyLabel', () => {
  it('rotula famílias conhecidas', () => {
    expect(serviceFamilyLabel('coloracao')).toBe('Coloração')
    expect(serviceFamilyLabel('reflexo')).toBe('Reflexo')
  })
})

describe('isBlankOrPlaceholderFamily', () => {
  it('marca atendimento', () => {
    expect(isBlankOrPlaceholderFamily('atendimento')).toBe(true)
    expect(isBlankOrPlaceholderFamily('corte')).toBe(false)
  })
})
