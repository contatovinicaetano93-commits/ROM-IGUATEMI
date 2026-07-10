import { getBrand } from '@/lib/brand'
import type { DirectorReport, MonthKey, QuarterKey } from './types'

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

export function label0011(report: DirectorReport): string {
  const { selected_quarter, compare_quarter } = report.period
  return `Retorno ${labelQuarter(selected_quarter)} vs ${labelQuarter(compare_quarter)}`
}

export function label0021(report: DirectorReport): string {
  const { selected_month, compare_month, compare_months } = report.period
  if (!compare_months || !compare_month) {
    return `Fat ${labelMonth(selected_month)}`
  }
  const [older, newer] = orderMonths(selected_month, compare_month)
  return `Fat ${labelMonth(older)} → ${labelMonth(newer)}`
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

function subjectPrefix(report: DirectorReport) {
  return report.source === 'mock' ? '[DEMO] ' : ''
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
  const { selected_month, compare_month, compare_months } = report.period
  if (!compare_months || !compare_month) {
    return `0021_${selected_month}`.replace(/[^a-zA-Z0-9_-]/g, '_')
  }
  const [older, newer] = orderMonths(selected_month, compare_month)
  return `0021_${older}_para_${newer}`.replace(/[^a-zA-Z0-9_-]/g, '_')
}

export function slugPeriod(report: DirectorReport): string {
  return `${slug0011(report)}_${slug0021(report)}`
}

export function previousMonth(month: MonthKey): MonthKey {
  const [y, m] = month.split('-').map(Number)
  if (!y || !m) return month
  if (m === 1) return `${y - 1}-12` as MonthKey
  return `${y}-${String(m - 1).padStart(2, '0')}` as MonthKey
}
