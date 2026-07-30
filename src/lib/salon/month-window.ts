/**
 * Janela de mês unificada para Visão analítica, Financeiro, TM e Relatórios.
 * Mês corrente: 1º → hoje (MTD). Mês fechado: 1º → último dia.
 */
import { todayIso } from '@/lib/salon/format'

export type MonthWindow = { from: string; to: string; month: string; mtd: boolean }

const MONTH_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function currentMonthKey(referenceDay: string): string {
  return referenceDay.slice(0, 7)
}

function calendarMonthRange(monthKey: string): { from: string; to: string } {
  const [y, m] = monthKey.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y!, m!, 0)).getUTCDate()
  return { from: `${monthKey}-01`, to: `${monthKey}-${String(lastDay).padStart(2, '0')}` }
}

function previousMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  const d = new Date(Date.UTC(y!, m! - 2, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function labelMonthPt(monthKey: string): string {
  const [y, m] = monthKey.split('-')
  const idx = Number(m) - 1
  return `${MONTH_PT[idx] ?? m}/${y}`
}

/**
 * Resolve YYYY-MM → { from, to }.
 * Sempre MTD no mês corrente (alinha Visão/Financeiro/TM/Relatórios).
 */
export function resolveMonthWindow(
  monthKey: string,
  referenceDay = todayIso(),
): MonthWindow {
  const month = /^\d{4}-\d{2}$/.test(monthKey) ? monthKey : currentMonthKey(referenceDay)
  const range = calendarMonthRange(month)
  const mtd = month === currentMonthKey(referenceDay)
  return {
    month,
    from: range.from,
    to: mtd ? referenceDay : range.to,
    mtd,
  }
}

/**
 * Janela do mês anterior comparável ao mês base escolhido:
 * - mês corrente (MTD) → mês anterior até o mesmo dia
 * - mês fechado → mês anterior cheio
 */
export function resolvePreviousComparableWindow(
  current: MonthWindow,
): { month: string; from: string; to: string; label: string; mtd_aligned: boolean } {
  const month = previousMonthKey(current.month)
  const full = resolveMonthWindow(month, current.to)
  if (!current.mtd) {
    return {
      month,
      from: full.from,
      to: full.to,
      label: labelMonthPt(month),
      mtd_aligned: false,
    }
  }
  const dayNum = Number(current.to.slice(8, 10))
  const lastDay = Number(full.to.slice(8, 10))
  const clamped = Math.min(dayNum, lastDay)
  const to = `${month}-${String(clamped).padStart(2, '0')}`
  return {
    month,
    from: full.from,
    to,
    label: `${labelMonthPt(month)} (até dia ${clamped})`,
    mtd_aligned: true,
  }
}
