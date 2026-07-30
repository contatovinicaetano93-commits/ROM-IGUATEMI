import { getBrand } from '@/lib/brand'
import type { DirectorReport, MonthKey, MonthRevenueRow, QuarterKey, QuarterRevenueRow } from './types'

const MONTH_PT = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
]

export function labelMonth(month: MonthKey): string {
  const [y, m] = month.split('-')
  const idx = Number(m) - 1
  if (!y || idx < 0 || idx > 11) return month
  return `${MONTH_PT[idx]}/${y}`
}

export function labelQuarter(quarter: QuarterKey): string {
  const [y, q] = quarter.split('-Q')
  if (!y || !q) return quarter
  return `${q}º tri/${y}`
}

/** Ordena dois YYYY-MM: [mais antigo, mais recente]. */
export function orderMonths(a: MonthKey, b: MonthKey): [MonthKey, MonthKey] {
  return a <= b ? [a, b] : [b, a]
}

/** Ordena dois YYYY-Qn: [mais antigo, mais recente]. */
export function orderQuarters(a: QuarterKey, b: QuarterKey): [QuarterKey, QuarterKey] {
  return a <= b ? [a, b] : [b, a]
}

export function quarterOfMonth(month: MonthKey): QuarterKey {
  const [y, m] = month.split('-')
  const q = Math.ceil(Number(m) / 3)
  return `${y}-Q${q}` as QuarterKey
}

/** Os 3 meses (YYYY-MM) que compõem um trimestre (YYYY-Qn). */
export function monthsInQuarter(quarter: QuarterKey): MonthKey[] {
  const [yStr, qStr] = quarter.split('-Q')
  const y = Number(yStr)
  const q = Number(qStr)
  const startMonth = (q - 1) * 3 + 1
  return [0, 1, 2].map((i) => `${y}-${String(startMonth + i).padStart(2, '0')}` as MonthKey)
}

export function monthsInComparableQuarter(
  quarter: QuarterKey,
  referenceMonth: MonthKey,
  selectedQuarter: QuarterKey,
  compareQuarter: QuarterKey
): MonthKey[] {
  const months = monthsInQuarter(quarter)
  const [, newer] = orderQuarters(selectedQuarter, compareQuarter)
  if (newer !== quarterOfMonth(referenceMonth)) return months

  const elapsedMonthIndex = monthsInQuarter(newer).indexOf(referenceMonth)
  if (elapsedMonthIndex < 0) return months
  return months.slice(0, elapsedMonthIndex + 1)
}

/** Agrega uma série mensal (0021) em linhas trimestrais — soma fat/atendidos, ticket = fat/atendidos. */
export function aggregateQuarterRevenue(months: MonthRevenueRow[]): QuarterRevenueRow[] {
  const byQuarter = new Map<QuarterKey, MonthRevenueRow[]>()
  for (const m of months) {
    const q = quarterOfMonth(m.month)
    const arr = byQuarter.get(q) ?? []
    arr.push(m)
    byQuarter.set(q, arr)
  }
  return Array.from(byQuarter.entries())
    .map(([quarter, rows]) => {
      const revenue = rows.reduce((s, r) => s + r.revenue, 0)
      const attended = rows.reduce((s, r) => s + r.attended, 0)
      const ticket_avg = attended > 0 ? Math.round(revenue / attended) : 0
      return { quarter, label: labelQuarter(quarter), revenue, ticket_avg, attended }
    })
    .sort((a, b) => a.quarter.localeCompare(b.quarter))
}

export function label0011(report: DirectorReport): string {
  const { selected_quarter, compare_quarter } = report.period
  return `Retorno ${labelQuarter(selected_quarter)} vs ${labelQuarter(compare_quarter)}`
}

export function label0021(report: DirectorReport): string {
  const { selected_month, selected_quarter_0021, compare_quarter_0021, compare_months } = report.period
  if (!compare_months || !compare_quarter_0021) {
    return `Fat ${labelMonth(selected_month)}`
  }
  const [older, newer] = orderQuarters(selected_quarter_0021, compare_quarter_0021)
  return `Fat ${labelQuarter(older)} → ${labelQuarter(newer)}`
}

export function reportPeriodLabel(report: DirectorReport): string {
  return `Etapa 1: ${label0011(report)} · Etapa 2: ${label0021(report)}`
}

export function reportReferenceDate(report: DirectorReport): string {
  const [y, m] = report.period.selected_month.split('-').map(Number)
  if (!y || !m) {
    return new Date(report.generated_at).toLocaleDateString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
    })
  }
  const last = new Date(Date.UTC(y, m, 0))
  return last.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
}

/** Ano civil atual em America/Sao_Paulo. */
export function currentYearSp(now = new Date()): number {
  const y = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
  }).format(now)
  return Number(y)
}

/**
 * Pedido com período histórico (ex.: 2025 quando o calendário já está em 2026).
 * Precisa de budget Avec completo — o caminho slim/55s da UI zera esses dados.
 *
 * `stage` limita quais chaves entram: evita que filtro da outra aba (ex. 0011 em
 * 2025-Q4) force caminho histórico no 0021 do ano corrente.
 */
export function isHistoricalDirectorPeriod(
  opts: {
    month?: string | null
    quarter?: string | null
    compare?: string | null
    quarter0021?: string | null
    compare0021?: string | null
    stage?: '0011' | '0021' | 'all' | null
    /** Se false, ignore compare0021 (UI não usa o trimestre de comparação). */
    compareMonths?: boolean | null
  },
  now = new Date(),
): boolean {
  const year = currentYearSp(now)
  const stage = opts.stage ?? 'all'
  const keys: Array<string | null | undefined> =
    stage === '0011'
      ? [opts.quarter, opts.compare]
      : stage === '0021'
        ? [
            opts.month,
            opts.quarter0021,
            opts.compareMonths === false ? null : opts.compare0021,
          ]
        : [
            opts.month,
            opts.quarter,
            opts.compare,
            opts.quarter0021,
            opts.compareMonths === false ? null : opts.compare0021,
          ]
  for (const key of keys) {
    if (!key) continue
    const y = Number(String(key).slice(0, 4))
    if (Number.isFinite(y) && y < year) return true
  }
  return false
}

function subjectPrefix(report: DirectorReport) {
  if (report.source === 'mock') return '[DEMO] '
  if (report.source === 'partial') return '[PARCIAL] '
  if (report.source === 'error') return '[SEM DADOS] '
  return ''
}

export function reportSubject0011(report: DirectorReport): string {
  const unit = getBrand().displayName
  return `${subjectPrefix(report)}${unit} · Etapa 1 · Relatório 0011 · ${label0011(report)} · ref. ${report.period.reference_date}`
}

export function reportSubject0021(report: DirectorReport): string {
  const unit = getBrand().displayName
  return `${subjectPrefix(report)}${unit} · Etapa 2 · Relatório 0021 · ${label0021(report)} · ref. ${report.period.reference_date}`
}

export function reportSubject(report: DirectorReport): string {
  const unit = getBrand().displayName
  return `${subjectPrefix(report)}${unit} · Relatório diretoria · ${reportPeriodLabel(report)} · ref. ${reportReferenceDate(report)}`
}

export function slug0011(report: DirectorReport): string {
  const { selected_quarter, compare_quarter } = report.period
  return `0011_${selected_quarter}_vs_${compare_quarter}`.replace(/[^a-zA-Z0-9_-]/g, '_')
}

export function slug0021(report: DirectorReport): string {
  const { selected_month, selected_quarter_0021, compare_quarter_0021, compare_months } = report.period
  if (!compare_months || !compare_quarter_0021) {
    return `0021_${selected_month}`.replace(/[^a-zA-Z0-9_-]/g, '_')
  }
  const [older, newer] = orderQuarters(selected_quarter_0021, compare_quarter_0021)
  return `0021_${older}_para_${newer}`.replace(/[^a-zA-Z0-9_-]/g, '_')
}

export function slugPeriod(report: DirectorReport): string {
  return `${slug0011(report)}_${slug0021(report)}`
}
