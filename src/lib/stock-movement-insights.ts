/** Insights de movimentação (0044 / 0323) — puros, seguros para Client Components. */

export type OutflowReasonBucket = 'consumo' | 'perda' | 'venda' | 'outros'

export const OUTFLOW_REASON_LABEL: Record<OutflowReasonBucket, string> = {
  consumo: 'Consumo',
  perda: 'Perda',
  venda: 'Venda',
  outros: 'Outros',
}

const PERDA_HINTS = ['perda', 'quebra', 'vencido', 'avaria', 'descarte', 'danificado', 'estragado']
const VENDA_HINTS = ['venda', 'pdv', 'revenda']
const CONSUMO_HINTS = ['consumo', 'uso', 'aplicacao', 'aplicação', 'servico', 'serviço', 'salao', 'salão']

export function classifyOutflowReason(reason: string | null | undefined): OutflowReasonBucket {
  const r = (reason ?? '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
  if (PERDA_HINTS.some((h) => r.includes(h))) return 'perda'
  if (VENDA_HINTS.some((h) => r.includes(h))) return 'venda'
  if (CONSUMO_HINTS.some((h) => r.includes(h))) return 'consumo'
  return 'outros'
}

/** Entrada marcada/enriquecida como pedido de compra (Avec 0323). */
export function isPurchaseEntry(movement: {
  type: string
  reason: string | null | undefined
}): boolean {
  if (movement.type !== 'entrada') return false
  const r = (movement.reason ?? '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
  return r.includes('pedido de compra') || r.includes('pedido compra')
}

export interface MovementLike {
  type: 'entrada' | 'saida' | 'ajuste_manual' | string
  quantity: number
  cost: number | null
  reason: string | null
  occurred_at: string
}

export interface OutflowReasonSummary {
  bucket: OutflowReasonBucket
  label: string
  quantity: number
  cost: number
  count: number
}

function inDateRange(iso: string, fromIsoDay: string | null, toIsoDay: string | null): boolean {
  const day = iso.slice(0, 10)
  if (fromIsoDay && day < fromIsoDay) return false
  if (toIsoDay && day > toIsoDay) return false
  return true
}

/** Agrega saídas por motivo no intervalo (YYYY-MM-DD inclusivo). */
export function summarizeOutflowsByReason(
  movements: MovementLike[],
  fromIsoDay: string | null = null,
  toIsoDay: string | null = null,
): OutflowReasonSummary[] {
  const buckets: Record<OutflowReasonBucket, OutflowReasonSummary> = {
    consumo: { bucket: 'consumo', label: OUTFLOW_REASON_LABEL.consumo, quantity: 0, cost: 0, count: 0 },
    perda: { bucket: 'perda', label: OUTFLOW_REASON_LABEL.perda, quantity: 0, cost: 0, count: 0 },
    venda: { bucket: 'venda', label: OUTFLOW_REASON_LABEL.venda, quantity: 0, cost: 0, count: 0 },
    outros: { bucket: 'outros', label: OUTFLOW_REASON_LABEL.outros, quantity: 0, cost: 0, count: 0 },
  }

  for (const m of movements) {
    if (m.type !== 'saida') continue
    if (!inDateRange(m.occurred_at, fromIsoDay, toIsoDay)) continue
    const bucket = classifyOutflowReason(m.reason)
    const row = buckets[bucket]
    row.quantity += Number(m.quantity) || 0
    row.cost += Number(m.cost) || 0
    row.count += 1
  }

  return (Object.keys(buckets) as OutflowReasonBucket[]).map((k) => ({
    ...buckets[k],
    quantity: Math.round(buckets[k].quantity * 10) / 10,
    cost: Math.round(buckets[k].cost * 100) / 100,
  }))
}

export function listPurchaseEntries<T extends MovementLike>(
  movements: T[],
  limit = 20,
): T[] {
  return movements.filter(isPurchaseEntry).slice(0, limit)
}

/** YYYY-MM-DD em America/Sao_Paulo a partir de agora. */
export function todayIsoDaySp(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function addIsoDays(isoDay: string, delta: number): string {
  const [y, m, d] = isoDay.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, m! - 1, d! + delta))
  return dt.toISOString().slice(0, 10)
}
