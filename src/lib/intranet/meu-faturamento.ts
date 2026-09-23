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

export type { CommissionDiscountLine }
