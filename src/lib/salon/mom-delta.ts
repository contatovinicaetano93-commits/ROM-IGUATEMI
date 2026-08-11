import { formatCurrency } from '@/lib/salon/format'

/** Diff monetário com sinal tipográfico (−/+) para deltas MoM. */
export function fmtSignedCurrency(diff: number): string {
  const rounded = Math.round(diff * 100) / 100
  if (rounded === 0) return formatCurrency(0)
  const sign = rounded > 0 ? '+' : '−'
  return `${sign}${formatCurrency(Math.abs(rounded))}`
}

/** Diff inteiro com sinal tipográfico (−/+). */
export function fmtSignedNumber(diff: number): string {
  if (diff === 0) return '0'
  const sign = diff > 0 ? '+' : '−'
  return `${sign}${Math.abs(diff)}`
}

/** Diff em pontos percentuais (já em escala 0–100). */
export function fmtSignedPoints(diff: number, digits = 1): string {
  const rounded = Math.round(diff * 10 ** digits) / 10 ** digits
  if (rounded === 0) return '0 pp'
  const sign = rounded > 0 ? '+' : '−'
  return `${sign}${Math.abs(rounded)} pp`
}

export interface MomCompareLine {
  text: string
  /** true = verde (melhor); false = laranja (pior). */
  positive: boolean
}

/**
 * Linha de comparativo MoM. `invertGood` = menor é melhor (perdida, cancel, CMV, despesas).
 * Ausência (null) → sem linha; não inventa 0.
 */
export function momCompareLine(
  current: number | null | undefined,
  previous: number | null | undefined,
  previousLabel: string,
  opts?: { kind?: 'currency' | 'number' | 'points'; invertGood?: boolean },
): MomCompareLine | null {
  if (current == null || previous == null) return null
  const kind = opts?.kind ?? 'currency'
  const diff = current - previous
  if (kind === 'currency' && Math.round(diff * 100) / 100 === 0) return null
  if (kind !== 'currency' && diff === 0) return null

  const text =
    kind === 'currency'
      ? `${fmtSignedCurrency(diff)} vs ${previousLabel}`
      : kind === 'points'
        ? `${fmtSignedPoints(diff)} vs ${previousLabel}`
        : `${fmtSignedNumber(diff)} vs ${previousLabel}`

  const improved = opts?.invertGood ? diff <= 0 : diff >= 0
  return { text, positive: improved }
}
