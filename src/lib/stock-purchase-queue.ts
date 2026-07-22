/** Helpers puros da fila de compra — seguros para Client Components. */

export interface PurchaseQueueAlert {
  product_name: string
  current_qty: number
  minimum_qty: number
  suggested_reposition: number | null
  unit_cost: number | null
}

/** Déficit vs mínimo (zerados ganham peso extra para subir na fila). */
export function alertUrgencyUnits(
  alert: Pick<PurchaseQueueAlert, 'current_qty' | 'minimum_qty'>,
): number {
  const deficit = Math.max(0, Number(alert.minimum_qty) - Number(alert.current_qty))
  if (Number(alert.current_qty) <= 0) return deficit + Math.max(Number(alert.minimum_qty), 1)
  return deficit
}

/** Custo estimado de reposição: sugestão Avec (0046) × custo unitário (0149). */
export function alertRepositionCost(
  alert: Pick<PurchaseQueueAlert, 'suggested_reposition' | 'unit_cost'>,
): number | null {
  if (alert.suggested_reposition == null || alert.unit_cost == null) return null
  if (!(alert.suggested_reposition > 0) || !(alert.unit_cost > 0)) return null
  return Math.round(alert.suggested_reposition * alert.unit_cost * 100) / 100
}

/**
 * Score da fila de compra: urgência × custo estimado.
 * Sem custo conhecido, prioriza só pela urgência (×1).
 */
export function purchaseQueueScore(alert: PurchaseQueueAlert): number {
  const urgency = alertUrgencyUnits(alert)
  const cost = alertRepositionCost(alert)
  return urgency * Math.max(cost ?? 1, 1)
}

export function sortPurchaseQueue<T extends PurchaseQueueAlert>(alerts: T[]): T[] {
  return [...alerts].sort((a, b) => {
    const diff = purchaseQueueScore(b) - purchaseQueueScore(a)
    if (diff !== 0) return diff
    return a.product_name.localeCompare(b.product_name, 'pt-BR')
  })
}

export function purchaseQueueTotalCost(alerts: PurchaseQueueAlert[]): number {
  return (
    Math.round(alerts.reduce((sum, a) => sum + (alertRepositionCost(a) ?? 0), 0) * 100) / 100
  )
}
