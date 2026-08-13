/**
 * Janela de mês unificada para Visão analítica, Financeiro, TM e Relatórios.
 * Mês corrente: 1º → hoje (MTD). Mês fechado: 1º → último dia.
 *
 * Comparativo padrão: mesmo mês do ano passado (YoY), mesmo dia se MTD.
 * Mês comparado escolhido à mão também recorta o mesmo dia quando o base está aberto.
 */
import { todayIso } from '@/lib/salon/format'

export type MonthWindow = { from: string; to: string; month: string; mtd: boolean }

export type ComparableWindow = {
  month: string
  from: string
  to: string
  label: string
  mtd_aligned: boolean
}

/** Primeiro mês disponível no seletor “Comparar com”. */
export const COMPARE_MONTHS_FROM = '2025-01'

const MONTH_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function currentMonthKey(referenceDay: string): string {
  return referenceDay.slice(0, 7)
}

function calendarMonthRange(monthKey: string): { from: string; to: string } {
  const [y, m] = monthKey.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y!, m!, 0)).getUTCDate()
  return { from: `${monthKey}-01`, to: `${monthKey}-${String(lastDay).padStart(2, '0')}` }
}

export function yearAgoMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  return `${y! - 1}-${String(m).padStart(2, '0')}`
}

export function labelMonthPt(monthKey: string): string {
  const [y, m] = monthKey.split('-')
  const idx = Number(m) - 1
  return `${MONTH_PT[idx] ?? m}/${y}`
}

/** Rótulo do recorte: mês cheio, ou “até dia N” quando MTD. */
export function formatMonthWindowLabel(month: string, to: string, mtd: boolean): string {
  const base = labelMonthPt(month)
  if (!mtd) return base
  return `${base} (até dia ${Number(to.slice(8, 10))})`
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

function alignToCurrentDay(current: MonthWindow, month: string): ComparableWindow {
  const full = calendarMonthRange(month)
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

/**
 * Janela comparável ao mês base.
 * Sem `compareMonth` → mesmo mês do ano passado.
 * Com `compareMonth` → aquele mês, recortado no mesmo dia se o base estiver aberto.
 */
export function resolveComparableWindow(
  current: MonthWindow,
  compareMonth?: string | null,
): ComparableWindow {
  const month =
    compareMonth && /^\d{4}-\d{2}$/.test(compareMonth)
      ? compareMonth
      : yearAgoMonthKey(current.month)
  return alignToCurrentDay(current, month)
}

/** @deprecated use resolveComparableWindow — default é YoY, não mês anterior. */
export function resolvePreviousComparableWindow(current: MonthWindow): ComparableWindow {
  return resolveComparableWindow(current)
}
