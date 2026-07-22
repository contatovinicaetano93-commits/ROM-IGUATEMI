import { describe, expect, it } from 'vitest'
import {
  alertRepositionCost,
  alertUrgencyUnits,
  purchaseQueueScore,
  purchaseQueueTotalCost,
  sortPurchaseQueue,
  type PurchaseQueueAlert,
} from '@/lib/stock-purchase-queue'

function alert(
  partial: Partial<PurchaseQueueAlert> & Pick<PurchaseQueueAlert, 'product_name'>,
): PurchaseQueueAlert {
  return {
    current_qty: 0,
    minimum_qty: 5,
    suggested_reposition: 5,
    unit_cost: 10,
    ...partial,
  }
}

describe('purchase queue scoring', () => {
  it('estima custo de reposição', () => {
    expect(alertRepositionCost({ suggested_reposition: 3, unit_cost: 12 })).toBe(36)
    expect(alertRepositionCost({ suggested_reposition: null, unit_cost: 12 })).toBeNull()
  })

  it('dá mais urgência a zerados', () => {
    expect(alertUrgencyUnits({ current_qty: 0, minimum_qty: 5 })).toBeGreaterThan(
      alertUrgencyUnits({ current_qty: 2, minimum_qty: 5 }),
    )
  })

  it('ordena fila por score e soma custo', () => {
    const list = [
      alert({
        product_name: 'Balsamo',
        current_qty: 4,
        minimum_qty: 5,
        suggested_reposition: 1,
        unit_cost: 100,
      }),
      alert({
        product_name: 'Tintura',
        current_qty: 0,
        minimum_qty: 10,
        suggested_reposition: 10,
        unit_cost: 20,
      }),
      alert({
        product_name: 'Shampoo',
        current_qty: 1,
        minimum_qty: 5,
        suggested_reposition: 4,
        unit_cost: 50,
      }),
    ]
    const sorted = sortPurchaseQueue(list)
    expect(sorted[0]?.product_name).toBe('Tintura')
    expect(purchaseQueueScore(sorted[0]!)).toBeGreaterThan(purchaseQueueScore(sorted[1]!))
    expect(purchaseQueueTotalCost(list)).toBe(100 + 200 + 200)
  })
})
