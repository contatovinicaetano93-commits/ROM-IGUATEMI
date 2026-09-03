import { describe, expect, it } from 'vitest'
import { classifyNonBillable, isNonBillable } from '@/lib/salon/non-billable'

describe('non-billable', () => {
  it('detecta teste por nome de contato ou serviço QA', () => {
    expect(classifyNonBillable({ contact_name: 'ANA TESTE', name: 'Corte' })).toBe('teste')
    expect(classifyNonBillable({ name: 'Agenda teste', contact_name: 'Maria' })).toBe('teste')
    expect(classifyNonBillable({ name: 'Test', notes: null })).toBe('teste')
  })

  it('não trata TESTE DE MECHAS (serviço real) como teste', () => {
    expect(
      classifyNonBillable({
        name: 'TESTE DE MECHAS',
        contact_name: 'JULIA BARROS',
      }),
    ).toBeNull()
    expect(
      classifyNonBillable({
        name: 'Teste de mecha',
        contact_name: 'Maria',
      }),
    ).toBeNull()
  })

  it('detecta cortesia por serviço/notes sem confundir com Corte', () => {
    expect(classifyNonBillable({ name: 'Corte', contact_name: 'Ana' })).toBeNull()
    expect(classifyNonBillable({ name: 'CORTESIA', contact_name: 'Isabella' })).toBe('cortesia')
    expect(classifyNonBillable({ name: 'CORTESIA CARINA', contact_name: 'Tarsila' })).toBe(
      'cortesia',
    )
    expect(classifyNonBillable({ name: 'Cortesia escova', contact_name: 'Ana' })).toBe('cortesia')
    expect(classifyNonBillable({ name: 'Escova', notes: 'brinde cliente' })).toBe('cortesia')
  })

  it('prioriza cortesia sobre palavra teste no mesmo blob', () => {
    expect(classifyNonBillable({ name: 'teste cortesia' })).toBe('cortesia')
  })

  it('trata preço zero só quando já concluído nesta ocorrência', () => {
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
    expect(
      classifyNonBillable({
        name: 'Escova',
        last_price: 0,
        last_done_at: '2026-08-07T15:00:00.000Z',
        scheduled_at: '2026-08-07T14:00:00.000Z',
      }),
    ).toBe('cortesia')
  })

  it('não usa last_price 0 histórico em rebooking aberto', () => {
    expect(
      classifyNonBillable({
        name: 'Escova',
        last_price: 0,
        last_done_at: '2026-07-01T15:00:00.000Z',
        scheduled_at: '2026-08-07T14:00:00.000Z',
      }),
    ).toBeNull()
    expect(isNonBillable({ name: 'Corte' })).toBe(false)
  })

  it('aceita Date do postgres.js no preço zero', () => {
    expect(
      classifyNonBillable({
        name: 'Escova',
        last_price: 0,
        last_done_at: new Date('2026-08-07T15:00:00.000Z'),
        scheduled_at: new Date('2026-08-07T14:00:00.000Z'),
      }),
    ).toBe('cortesia')
    expect(
      classifyNonBillable({
        name: 'Escova',
        last_price: 0,
        last_done_at: new Date('2026-07-01T15:00:00.000Z'),
        scheduled_at: new Date('2026-08-07T14:00:00.000Z'),
      }),
    ).toBeNull()
  })
})
