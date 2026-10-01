/**
 * Transições de status da Folha + merge de extras (U/DARF/DAS) nas linhas.
 */

import type { RomPanelId } from '@/lib/brand'
import {
  buildFolhaDraftFrom8123,
  buildFolhaDraftLine,
  type FolhaDraft,
  type FolhaDraftLine,
} from '@/lib/folha/draft-from-8123'
import { roundFolha } from '@/lib/folha/calc'
import type { FolhaPeriodStatus } from '@/lib/folha/types'
import { occupancyMergeKey } from '@/lib/director-report/match-pro'
import type { CommissionProfessionalRow } from '@/lib/salon/commission-metrics'

export type FolhaLineExtrasPatch = Partial<FolhaDraftLine['folha_extras']>

const STATUS_RANK: Record<FolhaPeriodStatus, number> = {
  awaiting_rules: 0,
  draft: 1,
  ready_for_review: 2,
  approved: 3,
  paid: 4,
}

export function canTransitionFolhaStatus(
  from: FolhaPeriodStatus,
  to: FolhaPeriodStatus,
): boolean {
  if (from === to) return true
  // Reabrir para draft a partir de review/approved (correção).
  if (to === 'draft' && (from === 'ready_for_review' || from === 'approved')) return true
  // Fluxo linear draft → review → approved → paid
  if (from === 'draft' && to === 'ready_for_review') return true
  if (from === 'ready_for_review' && to === 'approved') return true
  if (from === 'approved' && to === 'paid') return true
  // Atalho admin: draft → approved (review implícita)
  if (from === 'draft' && to === 'approved') return true
  return STATUS_RANK[to] === STATUS_RANK[from] + 1
}

export function sumProposedPay(lines: readonly FolhaDraftLine[]): number | null {
  let total: number | null = null
  for (const line of lines) {
    if (line.proposed_pay == null) continue
    total = (total ?? 0) + line.proposed_pay
  }
  return roundFolha(total, 2)
}

function findSourcePro(
  professionals: readonly CommissionProfessionalRow[],
  name: string,
): CommissionProfessionalRow | null {
  const key = occupancyMergeKey(name)
  if (!key) return null
  for (const p of professionals) {
    if (occupancyMergeKey(p.name) === key) return p
  }
  // fallback exact
  return professionals.find((p) => p.name === name) ?? null
}

/**
 * Reaplica extras numa linha a partir do profissional 8123 de origem.
 * Se a origem sumiu, só atualiza extras/proposed sobre a linha atual.
 */
export function patchFolhaLineExtras(args: {
  panel: RomPanelId
  line: FolhaDraftLine
  source: CommissionProfessionalRow | null
  extras: FolhaLineExtrasPatch
}): FolhaDraftLine {
  const mergedExtras = { ...args.line.folha_extras, ...args.extras }
  if (args.source) {
    return buildFolhaDraftLine(args.panel, args.source, mergedExtras)
  }
  // Sem source: recalcula proposed_pay manualmente a partir do net_payable.
  const rebuilt = buildFolhaDraftLine(
    args.panel,
    {
      name: args.line.name,
      role: args.line.cargo_raw,
      charged: args.line.avec.charged,
      service_share: args.line.avec.service_share,
      product_share: args.line.avec.product_share,
      other_share: null,
      tip: args.line.avec.tip,
      product_spend: args.line.avec.product_spend,
      card_fee: args.line.avec.card_fee,
      admin_fee: args.line.avec.admin_fee,
      assistant_discount: args.line.avec.assistant_discount,
      other_discounts: args.line.avec.other_discounts,
      net_payable: args.line.avec.net_payable,
      house_share: args.line.avec.house_share,
    },
    mergedExtras,
  )
  return rebuilt
}

export function applyExtrasToDraftLines(args: {
  panel: RomPanelId
  lines: FolhaDraftLine[]
  sourceProfessionals: readonly CommissionProfessionalRow[]
  professionalName: string
  extras: FolhaLineExtrasPatch
}): { lines: FolhaDraftLine[]; total: number | null; matched: boolean } {
  const key = occupancyMergeKey(args.professionalName)
  let matched = false
  const lines = args.lines.map((line) => {
    const same =
      line.name === args.professionalName ||
      (key != null && occupancyMergeKey(line.name) === key)
    if (!same) return line
    matched = true
    const source = findSourcePro(args.sourceProfessionals, line.name)
    return patchFolhaLineExtras({
      panel: args.panel,
      line,
      source,
      extras: args.extras,
    })
  })
  return { lines, total: sumProposedPay(lines), matched }
}

/** Rebuild draft from 8123 rows preservando extras por nome. */
export function refreshDraftPreservingExtras(args: {
  panel: RomPanelId
  referenceDay: string
  professionals: readonly CommissionProfessionalRow[]
  previousLines: readonly FolhaDraftLine[]
  quinzenaDay?: string
}): FolhaDraft {
  const extrasByKey = new Map<string, FolhaDraftLine['folha_extras']>()
  for (const line of args.previousLines) {
    const key = occupancyMergeKey(line.name) || line.name
    extrasByKey.set(key, line.folha_extras)
  }

  const base = buildFolhaDraftFrom8123({
    panel: args.panel,
    referenceDay: args.referenceDay,
    professionals: args.professionals,
    quinzenaDay: args.quinzenaDay,
  })

  const lines = base.lines.map((line) => {
    const key = occupancyMergeKey(line.name) || line.name
    const extras = extrasByKey.get(key)
    if (!extras) return line
    const source = findSourcePro(args.professionals, line.name)
    return patchFolhaLineExtras({
      panel: args.panel,
      line,
      source,
      extras,
    })
  })

  return {
    ...base,
    lines,
    line_count: lines.length,
    total_proposed_pay: sumProposedPay(lines),
  }
}

export function periodRowToDraft(
  panel: RomPanelId,
  row: {
    id: string
    year_month: string
    half: 1 | 2
    from_day: string
    to_day: string
    reference_day: string | null
    lines: FolhaDraftLine[]
    total_proposed_pay: number | null
  },
): FolhaDraft {
  return {
    source: '8123',
    reference_day: row.reference_day ?? row.to_day,
    quinzena: {
      id: row.id,
      label:
        row.half === 1
          ? `1ª quinzena ${row.year_month.slice(5)}/${row.year_month.slice(0, 4)}`
          : `2ª quinzena ${row.year_month.slice(5)}/${row.year_month.slice(0, 4)}`,
      from: row.from_day,
      to: row.to_day,
      half: row.half,
      yearMonth: row.year_month,
    },
    panel,
    line_count: row.lines.length,
    lines: row.lines,
    total_proposed_pay: row.total_proposed_pay,
  }
}
