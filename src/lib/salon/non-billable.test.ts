import { describe, expect, it } from 'vitest'
import { classifyNonBillable, isNonBillable } from '@/lib/salon/non-billable'

describe('non-billable', () => {
  it('detecta teste por nome de contato ou serviço', () => {
    expect(classifyNonBillable({ contact_name: 'ANA TESTE', name: 'Corte' })).toBe('teste')
    expect(classifyNonBillable({ name: 'Agenda teste', contact_name: 'Maria' })).toBe('teste')
    expect(classifyNonBillable({ name: 'Test', notes: null })).toBe('teste')
  })

  it('detecta cortesia por serviço/notes sem confundir com Corte', () => {
    expect(classifyNonBillable({ name: 'Corte', contact_name: 'Ana' })).toBeNull()
    expect(classifyNonBillable({ name: 'Cortesia escova', contact_name: 'Ana' })).toBe('cortesia')
    expect(classifyNonBillable({ name: 'Escova', notes: 'brinde cliente' })).toBe('cortesia')
  })

  it('trata preço zero só quando já concluído', () => {
    expect(
      classifyNonBillable({
        name: 'Escova',
        last_price: 0,
        last_done_at: null,
      }),
    ).toBeNull()
    expect(
      classifyNonBillable({
        name: 'Escova',
        last_price: 0,
        last_done_at: '2026-08-07T15:00:00.000Z',
      }),
    ).toBe('cortesia')
  })

  it('prioriza teste quando ambos aparecem', () => {
    expect(classifyNonBillable({ name: 'teste cortesia' })).toBe('teste')
    expect(isNonBillable({ name: 'Corte' })).toBe(false)
  })
})
