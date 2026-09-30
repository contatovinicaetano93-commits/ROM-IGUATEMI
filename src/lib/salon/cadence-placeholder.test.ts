import { describe, expect, it } from 'vitest'
import { isCadencePlaceholderServiceName } from '@/lib/salon/cadence-placeholder'

describe('isCadencePlaceholderServiceName', () => {
  it('reconhece Atendimento e variantes genéricas', () => {
    expect(isCadencePlaceholderServiceName('Atendimento')).toBe(true)
    expect(isCadencePlaceholderServiceName('  atendimento  ')).toBe(true)
    expect(isCadencePlaceholderServiceName('Serviço')).toBe(true)
    expect(isCadencePlaceholderServiceName('Servico')).toBe(true)
    expect(isCadencePlaceholderServiceName('Visita')).toBe(true)
  })

  it('não marca procedimento real', () => {
    expect(isCadencePlaceholderServiceName('MANICURE - PEDICURE 185,00')).toBe(false)
    expect(isCadencePlaceholderServiceName('CORTE ROMEU - 1.690,00')).toBe(false)
    expect(isCadencePlaceholderServiceName('Atendimento VIP')).toBe(false)
  })
})
