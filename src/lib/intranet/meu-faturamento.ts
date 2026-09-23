import {
  findNearProInMap,
  matchDirectorProfessional,
  occupancyMergeKey,
} from '@/lib/director-report/match-pro'
import { listDirectorProfessionals } from '@/lib/director-report/professionals'
import type { P1ProfessionalRow } from '@/lib/salon/p1-metrics'
import type { CommissionProfessionalRow } from '@/lib/salon/commission-metrics'
import type { CommissionDiscountLine } from '@/lib/salon/commission-discount-metrics'

export type MeuFaturamentoMetrics = {
  matched_name: string | null
  revenue: number | null
  attended: number | null
  ticket_avg: number | null
  occupancy: number | null
}

/** Espelho 8123 — ausente → null (não inventa 0). */
export type MeuComissaoMetrics = {
  commission_matched_name: string | null
  charged: number | null
  service_share: number | null
  product_share: number | null
  other_share: number | null
  assistant_discount: number | null
  product_spend: number | null
  other_discounts: number | null
  card_fee: number | null
  admin_fee: number | null
  tip: number | null
  net_payable: number | null
  house_share: number | null
}

const EMPTY_P1: MeuFaturamentoMetrics = {
  matched_name: null,
  revenue: null,
  attended: null,
  ticket_avg: null,
  occupancy: null,
}

const EMPTY_COMMISSION: MeuComissaoMetrics = {
  commission_matched_name: null,
  charged: null,
  service_share: null,
  product_share: null,
  other_share: null,
  assistant_discount: null,
  product_spend: null,
  other_discounts: null,
  card_fee: null,
  admin_fee: null,
  tip: null,
  net_payable: null,
  house_share: null,
}

/**
 * Resolve o faturamento bruto do profissional no snapshot P1 (0021+0126).
 * Ausência de match ou snapshot → null (não inventa 0).
 * R$ 0 real do Avec só aparece quando a linha existe.
 */
export function resolveMeuFaturamento(
  professionals: readonly P1ProfessionalRow[],
  linkName: string | null | undefined,
): MeuFaturamentoMetrics {
  const name = linkName?.trim() ?? ''
  if (!name || professionals.length === 0) return { ...EMPTY_P1 }

  const byPro = new Map<string, P1ProfessionalRow>()
  for (const row of professionals) {
    const key = occupancyMergeKey(row.name)
    if (!key) continue
    if (!byPro.has(key)) byPro.set(key, row)
  }
  const hit = findNearProInMap(byPro, name)
  if (!hit) return { ...EMPTY_P1 }

  return {
    matched_name: hit.value.name,
    revenue: hit.value.revenue,
    attended: hit.value.attended,
    ticket_avg: hit.value.ticket_avg,
    occupancy: hit.value.occupancy,
  }
}

/**
 * Resolve comissão líquida / abatimentos / rateios no snapshot 8123.
 * Espelho Avec — não aplica % sobre revenue do 0021.
 */
export function resolveMeuComissao(
  professionals: readonly CommissionProfessionalRow[],
  linkName: string | null | undefined,
): MeuComissaoMetrics {
  const name = linkName?.trim() ?? ''
  if (!name || professionals.length === 0) return { ...EMPTY_COMMISSION }

  const byPro = new Map<string, CommissionProfessionalRow>()
  for (const row of professionals) {
    const key = occupancyMergeKey(row.name)
    if (!key) continue
    if (!byPro.has(key)) byPro.set(key, row)
  }
  const hit = findNearProInMap(byPro, name)
  if (!hit) return { ...EMPTY_COMMISSION }

  const row = hit.value
  return {
    commission_matched_name: row.name,
    charged: row.charged,
    service_share: row.service_share,
    product_share: row.product_share,
    other_share: row.other_share,
    assistant_discount: row.assistant_discount,
    product_spend: row.product_spend,
    other_discounts: row.other_discounts,
    card_fee: row.card_fee,
    admin_fee: row.admin_fee,
    tip: row.tip,
    net_payable: row.net_payable,
    house_share: row.house_share,
  }
}

/**
 * Avec pro id do elenco da unidade a partir do Nome no Avec do employee.
 * Sem match ou sem id no roster → null (0029 não roda).
 */
export function resolveAvecProId(linkName: string | null | undefined): string | null {
  const name = linkName?.trim() ?? ''
  if (!name) return null
  const hit = matchDirectorProfessional(name, listDirectorProfessionals())
  const id = hit?.avec_pro_id?.trim()
  return id || null
}

/** Campo 8123 com o qual o grupo 0029 concilia (quando reconhecido). */
export type CommissionDiscountReconcileKey =
  | 'assistant_discount'
  | 'product_spend'
  | 'other_discounts'
  | 'card_fee'
  | 'admin_fee'
  | 'tip'

export type CommissionDiscountGroup = {
  /** Chave estável (categoria normalizada). */
  key: string
  /** Rótulo de exibição (primeira ocorrência). */
  category: string
  /** Soma dos amounts presentes; null se nenhum amount. */
  total: number | null
  count: number
  lines: CommissionDiscountLine[]
  reconcile_key: CommissionDiscountReconcileKey | null
}

function categoryKey(raw: string | null | undefined): string {
  const s = (raw ?? '').trim().toLowerCase()
  return s || 'lancamento'
}

function displayCategory(raw: string | null | undefined): string {
  const s = (raw ?? '').trim()
  return s || 'Lançamento'
}

/**
 * Mapeia categoria 0029 → bucket de abatimento 8123 (conciliação).
 * Desconhecido → null (não força “outros”).
 */
export function reconcileKeyForDiscountCategory(
  category: string | null | undefined,
): CommissionDiscountReconcileKey | null {
  const key = categoryKey(category)
  if (!key || key === 'lancamento') return null
  if (key.includes('assistente')) return 'assistant_discount'
  if (key.includes('produto') || key.includes('gasto')) return 'product_spend'
  if (
    key.includes('taxa') &&
    (key.includes('cr') || key.includes('cart') || key.includes('credito') || key.includes('crédito'))
  ) {
    return 'card_fee'
  }
  if (key.includes('taxa') && (key.includes('adm') || key.includes('administr'))) {
    return 'admin_fee'
  }
  if (key.includes('caixinha') || key.includes('gorjeta')) return 'tip'
  if (key.includes('desconto') || key.includes('bônus') || key.includes('bonus')) {
    return 'other_discounts'
  }
  return null
}

/**
 * Agrupa linhas 0029 por categoria: total + N lançamentos (para conciliar com 8123).
 * Ordem: maior |total| primeiro; empate alfabético.
 */
export function groupCommissionDiscountLines(
  lines: readonly CommissionDiscountLine[],
): CommissionDiscountGroup[] {
  const byKey = new Map<string, CommissionDiscountGroup>()
  for (const line of lines) {
    const key = categoryKey(line.category)
    const existing = byKey.get(key)
    if (!existing) {
      const amount = line.amount
      byKey.set(key, {
        key,
        category: displayCategory(line.category),
        total: amount,
        count: 1,
        lines: [line],
        reconcile_key: reconcileKeyForDiscountCategory(line.category),
      })
      continue
    }
    existing.count += 1
    existing.lines.push(line)
    if (amountHas(line.amount)) {
      existing.total = (existing.total ?? 0) + line.amount!
    }
  }
  return [...byKey.values()].sort((a, b) => {
    const ta = a.total == null ? 0 : Math.abs(a.total)
    const tb = b.total == null ? 0 : Math.abs(b.total)
    if (tb !== ta) return tb - ta
    return a.category.localeCompare(b.category, 'pt-BR')
  })
}

function amountHas(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value)
}

/** Lê o total 8123 correspondente ao grupo (conciliação). */
export function commissionTotalForReconcileKey(
  metrics: MeuComissaoMetrics,
  key: CommissionDiscountReconcileKey | null,
): number | null {
  if (!key) return null
  switch (key) {
    case 'assistant_discount':
      return metrics.assistant_discount
    case 'product_spend':
      return metrics.product_spend
    case 'other_discounts':
      return metrics.other_discounts
    case 'card_fee':
      return metrics.card_fee
    case 'admin_fee':
      return metrics.admin_fee
    case 'tip':
      return metrics.tip
    default: {
      const _exhaustive: never = key
      return _exhaustive
    }
  }
}

export type { CommissionDiscountLine }
