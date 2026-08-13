import { getSql } from '@/lib/db'
import { todayIso } from '@/lib/salon/format'
import { labelMonth, labelQuarter, quarterOfMonth, monthsInQuarter } from '@/lib/director-report/period'
import type { MonthKey, QuarterKey } from '@/lib/director-report/types'
import {
  resolveMonthWindow,
  resolveComparableWindow,
} from '@/lib/salon/month-window'

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

function yearAgoQuarterKey(quarter: QuarterKey): QuarterKey {
  const [yStr, qStr] = quarter.split('-Q')
  return `${Number(yStr) - 1}-Q${qStr}` as QuarterKey
}

function calendarMonthRange(month: MonthKey): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate()
  return {
    start: `${month}-01`,
    end: `${month}-${String(last).padStart(2, '0')}`,
  }
}

function quarterBounds(quarter: QuarterKey): { start: string; end: string } {
  const months = monthsInQuarter(quarter)
  const first = calendarMonthRange(months[0]!)
  const last = calendarMonthRange(months[months.length - 1]!)
  return { start: first.start, end: last.end }
}

function addDaysIso(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

function daysInclusive(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00Z`).getTime()
  const b = new Date(`${to}T12:00:00Z`).getTime()
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1)
}

/**
 * Trimestre atual até referenceDay; mesmo trimestre do ano passado com o mesmo nº de dias.
 */
export function tmQuarterWindows(referenceDay: string): {
  current: { key: QuarterKey; label: string; start: string; end: string }
  previous: { key: QuarterKey; label: string; start: string; end: string }
} {
  const month = referenceDay.slice(0, 7) as MonthKey
  const currentKey = quarterOfMonth(month)
  const previousKey = yearAgoQuarterKey(currentKey)
  const curBounds = quarterBounds(currentKey)
  const prevBounds = quarterBounds(previousKey)
  const curEnd =
    referenceDay >= curBounds.start && referenceDay <= curBounds.end
      ? referenceDay
      : curBounds.end
  const span = daysInclusive(curBounds.start, curEnd)
  const prevEndRaw = addDaysIso(prevBounds.start, span - 1)
  const prevEnd = prevEndRaw > prevBounds.end ? prevBounds.end : prevEndRaw
  return {
    current: {
      key: currentKey,
      label: labelQuarter(currentKey),
      start: curBounds.start,
      end: curEnd,
    },
    previous: {
      key: previousKey,
      label: `${labelQuarter(previousKey)} (${span}d)`,
      start: prevBounds.start,
      end: prevEnd,
    },
  }
}

/** Janelas mensais TM — YoY (ou mês escolhido), MTD↔mesmo dia. */
export function tmMonthWindows(
  referenceDay: string,
  compareMonth?: string | null,
): {
  current: { key: MonthKey; label: string; start: string; end: string; mtd: boolean }
  previous: { key: string; label: string; start: string; end: string; mtd_aligned: boolean }
} {
  const currentMonth = referenceDay.slice(0, 7) as MonthKey
  const current = resolveMonthWindow(currentMonth, referenceDay)
  const previous = resolveComparableWindow(current, compareMonth)
  return {
    current: {
      key: currentMonth,
      label: current.mtd ? `${labelMonth(currentMonth)} (MTD)` : labelMonth(currentMonth),
      start: current.from,
      end: current.to,
      mtd: current.mtd,
    },
    previous: {
      key: previous.month,
      label: previous.label,
      start: previous.from,
      end: previous.to,
      mtd_aligned: previous.mtd_aligned,
    },
  }
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

/**
 * TM — mês vs mesmo mês ano passado (ou mês escolhido) e trimestre vs mesmo tri YoY.
 */
export async function fetchTmComparison(
  referenceDay = todayIso(),
  compareMonth?: string | null,
): Promise<TmComparison> {
  const months = tmMonthWindows(referenceDay, compareMonth)
  const quarters = tmQuarterWindows(referenceDay)

  const [curMonth, prevMonthData, curQuarter, prevQuarterData] = await Promise.all([
    sumDuration(months.current.start, months.current.end),
    sumDuration(months.previous.start, months.previous.end),
    sumDuration(quarters.current.start, quarters.current.end),
    sumDuration(quarters.previous.start, quarters.previous.end),
  ])

  return {
    month: {
      current: {
        key: months.current.key,
        label: months.current.label,
        ...curMonth,
      },
      previous: {
        key: months.previous.key,
        label: months.previous.label,
        ...prevMonthData,
      },
    },
    quarter: {
      current: {
        key: quarters.current.key,
        label: quarters.current.label,
        ...curQuarter,
      },
      previous: {
        key: quarters.previous.key,
        label: quarters.previous.label,
        ...prevQuarterData,
      },
    },
  }
}
