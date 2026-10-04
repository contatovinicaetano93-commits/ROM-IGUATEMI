/**
 * Preenche Taxa cartão (8123) em rascunhos sticky que nasceram sem o campo.
 *
 * Caso BR: o seed Fopag Q2 grava `card_fee: null` de propósito — a coluna
 * `taxa_cartao` da Base Folha Brasil NÃO é o 8123 (Alison: Fopag 1.183,31
 * vs Avec −588,01). A UI “Taxa cartão (8123)” precisa do valor Avec.
 *
 * Não mexe em a_pagar. Se `service_share` veio vazio (síntese Fopag),
 * preenche charged/2 + |card| para o rateio após cartão continuar charged/2
 * e o líquido do motor não oscilar.
 */

import { occupancyMergeKey } from '@/lib/director-report/match-pro'
import { roundFolha } from '@/lib/folha/calc'
import type { FolhaPeriodStatus } from '@/lib/folha/types'
import type { CommissionProfessionalRow } from '@/lib/salon/commission-metrics'

function proKey(name: string): string {
  return occupancyMergeKey(name) || name.trim().toLowerCase()
}

function cardMag(value: number): number {
  return Math.abs(value)
}

export function sourceMissingCardFee(
  rows: readonly Pick<CommissionProfessionalRow, 'card_fee' | 'charged'>[],
): boolean {
  return rows.some(
    (p) => p.card_fee == null && p.charged != null && Math.abs(p.charged) > 0.02,
  )
}

export function canPersistCardFeeOverlay(status: FolhaPeriodStatus): boolean {
  switch (status) {
    case 'awaiting_rules':
    case 'draft':
    case 'ready_for_review':
      return true
    case 'approved':
    case 'paid':
      return false
    default: {
      const _never: never = status
      return _never
    }
  }
}

export function overlayMissing8123CardFee(
  target: readonly CommissionProfessionalRow[],
  from8123: readonly CommissionProfessionalRow[],
): { rows: CommissionProfessionalRow[]; changed: boolean } {
  const byKey = new Map<string, CommissionProfessionalRow>()
  for (const p of from8123) {
    if (!p.name?.trim()) continue
    byKey.set(proKey(p.name), p)
  }

  let changed = false
  const rows = target.map((row) => {
    if (row.card_fee != null || !row.name?.trim()) return row
    const src = byKey.get(proKey(row.name))
    if (!src || src.card_fee == null) return row

    const card = src.card_fee
    let serviceShare = row.service_share
    if (serviceShare == null && row.charged != null) {
      serviceShare = roundFolha(row.charged / 2 + cardMag(card), 4)
    } else if (serviceShare == null) {
      serviceShare = src.service_share
    }
    changed = true
    return { ...row, card_fee: card, service_share: serviceShare }
  })
  return { rows, changed }
}
