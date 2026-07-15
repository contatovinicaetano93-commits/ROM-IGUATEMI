import { getSql } from '@/lib/db'
import { todayIso } from '@/lib/salon/format'
import { labelMonth, labelQuarter, quarterOfMonth, monthsInQuarter } from '@/lib/director-report/period'
import type { MonthKey, QuarterKey } from '@/lib/director-report/types'

export interface TmBucket {
  key: string
  label: string
  avgMinutes: number | null
  sampleCount: number
}

export interface TmComparison {
  month: { current: TmBucket; previous: TmBucket }
  quarter: { current: TmBucket; previous: TmBucket }
}

function monthKeyFromDate(d: Date): MonthKey {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}` as MonthKey
}

function previousMonthKey(month: MonthKey): MonthKey {
  const [y, m] = month.split('-').map(Number)
  return monthKeyFromDate(new Date(Date.UTC(y, m - 2, 1)))
}

function monthRange(month: MonthKey): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, '0')}` }
}

function previousQuarterKey(quarter: QuarterKey): QuarterKey {
  const [yStr, qStr] = quarter.split('-Q')
  const y = Number(yStr)
  const q = Number(qStr)
  return q === 1 ? (`${y - 1}-Q4` as QuarterKey) : (`${y}-Q${q - 1}` as QuarterKey)
}

function quarterRange(quarter: QuarterKey): { start: string; end: string } {
  const months = monthsInQuarter(quarter)
  return { start: monthRange(months[0]!).start, end: monthRange(months[months.length - 1]!).end }
}

async function sumDuration(start: string, end: string): Promise<{ avgMinutes: number | null; sampleCount: number }> {
  const sql = getSql()
  const rows = (await sql`
    select
      coalesce(sum(service_duration_sum_minutes), 0) as sum_minutes,
      coalesce(sum(service_duration_count), 0) as sample_count
    from salon_daily_metrics
    where day >= ${start}::date and day <= ${end}::date
  `) as { sum_minutes: string | number; sample_count: string | number }[]

  const row = rows[0]
  const sampleCount = Number(row?.sample_count ?? 0) || 0
  const sumMinutes = Number(row?.sum_minutes ?? 0) || 0
  return {
    sampleCount,
    avgMinutes: sampleCount > 0 ? Math.round((sumMinutes / sampleCount) * 10) / 10 : null,
  }
}

/** TM (Sprint 1) — mês atual vs anterior e trimestre atual vs anterior, a partir de salon_daily_metrics. */
export async function fetchTmComparison(referenceDay = todayIso()): Promise<TmComparison> {
  const [y, m] = referenceDay.split('-').map(Number)
  const currentMonth = `${y}-${String(m).padStart(2, '0')}` as MonthKey
  const prevMonth = previousMonthKey(currentMonth)
  const currentQuarter = quarterOfMonth(currentMonth)
  const prevQuarter = previousQuarterKey(currentQuarter)

  const curMonthRange = monthRange(currentMonth)
  const prevMonthRange = monthRange(prevMonth)
  const curQuarterRange = quarterRange(currentQuarter)
  const prevQuarterRange = quarterRange(prevQuarter)

  const [curMonth, prevMonthData, curQuarter, prevQuarterData] = await Promise.all([
    sumDuration(curMonthRange.start, curMonthRange.end),
    sumDuration(prevMonthRange.start, prevMonthRange.end),
    sumDuration(curQuarterRange.start, curQuarterRange.end),
    sumDuration(prevQuarterRange.start, prevQuarterRange.end),
  ])

  return {
    month: {
      current: { key: currentMonth, label: labelMonth(currentMonth), ...curMonth },
      previous: { key: prevMonth, label: labelMonth(prevMonth), ...prevMonthData },
    },
    quarter: {
      current: { key: currentQuarter, label: labelQuarter(currentQuarter), ...curQuarter },
      previous: { key: prevQuarter, label: labelQuarter(prevQuarter), ...prevQuarterData },
    },
  }
}
