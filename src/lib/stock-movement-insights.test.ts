import { describe, expect, it } from 'vitest'
import {
  classifyOutflowReason,
  isPurchaseEntry,
  listPurchaseEntries,
  summarizeOutflowsByReason,
} from '@/lib/stock-movement-insights'

describe('stock movement insights', () => {
  it('classifica motivos de saída', () => {
    expect(classifyOutflowReason('Consumo em serviço')).toBe('consumo')
    expect(classifyOutflowReason('Perda / quebra')).toBe('perda')
    expect(classifyOutflowReason('Venda balcão')).toBe('venda')
    expect(classifyOutflowReason(null)).toBe('outros')
  })

  it('detecta entrada por pedido de compra', () => {
    expect(isPurchaseEntry({ type: 'entrada', reason: 'Pedido de compra' })).toBe(true)
    expect(isPurchaseEntry({ type: 'saida', reason: 'Pedido de compra' })).toBe(false)
    expect(isPurchaseEntry({ type: 'entrada', reason: 'Devolução' })).toBe(false)
  })

  it('agrega saídas por motivo no período', () => {
    const summary = summarizeOutflowsByReason(
      [
        {
          type: 'saida',
          quantity: 2,
          cost: 20,
          reason: 'Consumo',
          occurred_at: '2026-07-20T12:00:00Z',
        },
        {
          type: 'saida',
          quantity: 1,
          cost: 50,
          reason: 'Perda',
          occurred_at: '2026-07-21T12:00:00Z',
        },
        {
          type: 'entrada',
          quantity: 5,
          cost: 10,
          reason: 'Pedido de compra',
          occurred_at: '2026-07-21T12:00:00Z',
        },
        {
          type: 'saida',
          quantity: 3,
          cost: 9,
          reason: 'Consumo',
          occurred_at: '2026-06-01T12:00:00Z',
        },
      ],
      '2026-07-01',
      '2026-07-31',
    )
    const consumo = summary.find((s) => s.bucket === 'consumo')
    const perda = summary.find((s) => s.bucket === 'perda')
    expect(consumo?.quantity).toBe(2)
    expect(consumo?.cost).toBe(20)
    expect(perda?.quantity).toBe(1)
    expect(perda?.count).toBe(1)
  })

  it('lista entradas de pedido', () => {
    const list = listPurchaseEntries([
      {
        type: 'entrada',
        quantity: 1,
        cost: 10,
        reason: 'Pedido de compra',
        occurred_at: '2026-07-21T12:00:00Z',
      },
      {
        type: 'entrada',
        quantity: 1,
        cost: 10,
        reason: 'Outro',
        occurred_at: '2026-07-21T12:00:00Z',
      },
    ])
    expect(list).toHaveLength(1)
  })
})
