/**
 * Consumo Baru (Zig Pay) → Folha `consumo_baru`.
 *
 * Places conhecidos (samples RH 2026-10):
 *   Jardins (Brasil)  = d5340303-fd78-4aaf-8e15-4807c0793db9
 *   Iguatemi          = eb40fde9-7dd1-4330-89f2-21398b106635
 *
 * Fonte: detailed-transactions por place — comprador com "(profissional)"
 * ou desconto ~15% (promo funcionários). Valores Zig vêm em centavos.
 */

import type { RomPanelId } from '@/lib/brand'
import {
  namesLooselyMatch,
  occupancyMergeKey,
} from '@/lib/director-report/match-pro'
import type { FolhaDraftLine } from '@/lib/folha/draft-from-8123'
import { roundFolha } from '@/lib/folha/calc'
import type { FolhaLineExtrasPatch } from '@/lib/folha/workflow'

export const ZIG_PLACE_ID_BY_PANEL: Record<RomPanelId, string> = {
  brasil: 'd5340303-fd78-4aaf-8e15-4807c0793db9',
  iguatemi: 'eb40fde9-7dd1-4330-89f2-21398b106635',
}

export type ZigTransaction = {
  date: string
  name?: string | null
  document?: string | null
  value?: number | null
  grossValue?: number | null
  discount?: number | null
  isRefunded?: boolean | null
  paymentMethods?: unknown
}

export type ZigEmployeeSpend = {
  /** Chave occupancyMergeKey do comprador (sem sufixo profissional). */
  key: string
  rawNames: string[]
  /** Valor pago (após desconto), em R$. */
  paidReais: number
  txs: number
}

const PROFISSIONAL_RE = /\(\s*profissional\s*\)/i

export function stripProfissionalTag(name: string): string {
  return name.replace(PROFISSIONAL_RE, ' ').replace(/\s+/g, ' ').trim()
}

/** Centavos Zig → reais. */
export function zigCentsToReais(cents: number): number {
  return Math.round(cents) / 100
}

/**
 * Heurística de consumo funcionário:
 * - nome traz "(profissional)", ou
 * - desconto entre 14% e 16% do gross (promo 15% funcionários).
 */
export function isZigEmployeeConsumoTx(tx: ZigTransaction): boolean {
  if (tx.isRefunded) return false
  const name = tx.name ?? ''
  if (PROFISSIONAL_RE.test(name)) return true
  const gross = tx.grossValue ?? 0
  const disc = tx.discount ?? 0
  if (gross > 0 && disc > 0) {
    const pct = disc / gross
    if (pct >= 0.14 && pct <= 0.16) return true
  }
  return false
}

export function aggregateZigEmployeeConsumo(
  txs: readonly ZigTransaction[],
  opts?: { fromIso?: string; toIso?: string },
): ZigEmployeeSpend[] {
  const from = opts?.fromIso ?? null
  const to = opts?.toIso ?? null
  const byKey = new Map<
    string,
    { paidCents: number; txs: number; rawNames: Set<string> }
  >()

  for (const tx of txs) {
    if (!isZigEmployeeConsumoTx(tx)) continue
    const day = (tx.date ?? '').slice(0, 10)
    if (from && day && day < from) continue
    if (to && day && day > to) continue
    const raw = (tx.name ?? '').trim()
    if (!raw) continue
    const key = occupancyMergeKey(stripProfissionalTag(raw))
    if (!key) continue
    const cur = byKey.get(key) ?? {
      paidCents: 0,
      txs: 0,
      rawNames: new Set<string>(),
    }
    cur.paidCents += tx.value ?? 0
    cur.txs += 1
    cur.rawNames.add(raw)
    byKey.set(key, cur)
  }

  return [...byKey.entries()]
    .map(([key, v]) => ({
      key,
      rawNames: [...v.rawNames],
      paidReais: zigCentsToReais(v.paidCents),
      txs: v.txs,
    }))
    .sort((a, b) => b.paidReais - a.paidReais)
}

export function matchZigSpendToFolhaName(
  folhaName: string,
  spends: readonly ZigEmployeeSpend[],
): ZigEmployeeSpend | null {
  const key = occupancyMergeKey(folhaName)
  if (!key) return null
  const exact = spends.find((s) => s.key === key)
  if (exact) return exact
  for (const s of spends) {
    if (namesLooselyMatch(key, s.key)) return s
  }
  return null
}

/**
 * Baru já embutido no 8123 aparece como residual em `outros_descontos`
 * e o a_pagar já neteou — não reabater via consumo_baru.
 */
export function zigBaruAlreadyEmbeddedIn8123(
  line: FolhaDraftLine,
  zigReais: number,
): boolean {
  const outros = line.outros_descontos
  if (outros == null || zigReais <= 0.02) return false
  return Math.abs(outros - zigReais) <= 2
}

export type ApplyZigConsumoResult = {
  applied: Array<{ name: string; consumo_baru: number; zig_key: string }>
  skipped_embedded: string[]
  skipped_manual: string[]
  unmatched_folha: string[]
  unmatched_zig: string[]
}

/**
 * Preenche `consumo_baru` nas linhas (não sobrescreve valor já lançado pelo RH).
 */
export function planZigConsumoBaruExtras(
  lines: readonly FolhaDraftLine[],
  spends: readonly ZigEmployeeSpend[],
): {
  patches: Array<{ professionalName: string; extras: FolhaLineExtrasPatch }>
  report: ApplyZigConsumoResult
} {
  const usedZig = new Set<string>()
  const patches: Array<{
    professionalName: string
    extras: FolhaLineExtrasPatch
  }> = []
  const report: ApplyZigConsumoResult = {
    applied: [],
    skipped_embedded: [],
    skipped_manual: [],
    unmatched_folha: [],
    unmatched_zig: [],
  }

  for (const line of lines) {
    const spend = matchZigSpendToFolhaName(line.name, spends)
    if (!spend || spend.paidReais <= 0.02) {
      if ((line.proposed_pay ?? 0) > 0.02) {
        report.unmatched_folha.push(line.name)
      }
      continue
    }
    usedZig.add(spend.key)
    if (line.folha_extras.consumo_baru != null) {
      report.skipped_manual.push(line.name)
      continue
    }
    if (zigBaruAlreadyEmbeddedIn8123(line, spend.paidReais)) {
      report.skipped_embedded.push(line.name)
      continue
    }
    const amount = roundFolha(spend.paidReais, 2)
    if (amount == null) continue
    patches.push({
      professionalName: line.name,
      extras: { consumo_baru: amount },
    })
    report.applied.push({
      name: line.name,
      consumo_baru: amount,
      zig_key: spend.key,
    })
  }

  for (const s of spends) {
    if (!usedZig.has(s.key) && s.paidReais > 0.02) {
      report.unmatched_zig.push(
        `${s.rawNames[0] ?? s.key} (R$ ${s.paidReais.toFixed(2)})`,
      )
    }
  }

  return { patches, report }
}

export function zigPlaceIdForPanel(panel: RomPanelId): string {
  const override =
    panel === 'iguatemi'
      ? process.env.ZIG_PLACE_ID_IGUATEMI?.trim()
      : process.env.ZIG_PLACE_ID_BRASIL?.trim()
  return override || ZIG_PLACE_ID_BY_PANEL[panel]
}

export function isZigFolhaConfigured(): boolean {
  return Boolean(process.env.ZIG_API_TOKEN?.trim())
}
