import { coerceOccupancyFraction } from '@/lib/salon/period-analytics'

export type WeekKpiTotals = {
  revenue: number | null
  attended: number | null
  occupancy: number | null
  /** NPS ainda não existe na operação — sempre ausente. */
  nps: null
}

/** Soma só o que foi medido. Sem nenhum dia → null, nunca 0 inventado. */
export function sumNullable(values: Array<number | null | undefined>): number | null {
  let total = 0
  let seen = false
  for (const value of values) {
    if (value == null) continue
    if (!Number.isFinite(value)) continue
    total += value
    seen = true
  }
  return seen ? total : null
}

export function averageOccupancyFractions(values: Array<number | null | undefined>): number | null {
  const fractions: number[] = []
  for (const value of values) {
    if (value == null) continue
    const occ = coerceOccupancyFraction(Number(value))
    if (occ == null) continue
    fractions.push(occ)
  }
  if (fractions.length === 0) return null
  const avg = fractions.reduce((acc, n) => acc + n, 0) / fractions.length
  return Math.round(avg * 1000) / 1000
}

export function buildWeekKpis(input: {
  revenues: Array<number | null | undefined>
  attended: Array<number | null | undefined>
  occupancies: Array<number | null | undefined>
}): WeekKpiTotals {
  return {
    revenue: sumNullable(input.revenues),
    attended: sumNullable(input.attended),
    occupancy: averageOccupancyFractions(input.occupancies),
    nps: null,
  }
}

export function formatKpiMoney(value: number | null): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatKpiCount(value: number | null): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('pt-BR').format(value)
}

export function formatKpiPercent(value: number | null): string {
  if (value == null) return '—'
  return `${Math.round(value * 1000) / 10}%`.replace('.', ',')
}
