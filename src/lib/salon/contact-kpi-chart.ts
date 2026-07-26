/** Agrega contatos CRM por dia e preenche a janela calendário (evita curva falsa). */

import { todayIso } from '@/lib/salon/format'

export interface ContactDayRow {
  day: string
  channel: string
  contacts_count: number
}

export interface ChartDayPoint {
  /** YYYY-MM-DD */
  day: string
  /** MM-DD para eixo */
  label: string
  total: number
}

function toDayKey(raw: string | Date): string | null {
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null
    return raw.toISOString().slice(0, 10)
  }
  const s = String(raw ?? '').trim()
  if (!s) return null
  const iso = s.match(/(\d{4}-\d{2}-\d{2})/)
  return iso?.[1] ?? null
}

function addUtcDays(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, m! - 1, d! + delta))
  return dt.toISOString().slice(0, 10)
}

/** Últimos `dayLimit` dias de calendário do salão, inclusive o dia de referência. */
export function contactKpiWindow(dayLimit = 30, referenceDay = todayIso()) {
  const days = Math.max(1, Math.min(366, Math.floor(dayLimit)))
  const to = referenceDay
  const from = addUtcDays(to, -(days - 1))
  return { from, to, days }
}

export function eachDayInclusive(from: string, to: string): string[] {
  if (from > to) return []
  const out: string[] = []
  let cur = from
  while (cur <= to) {
    out.push(cur)
    cur = addUtcDays(cur, 1)
    if (out.length > 400) break
  }
  return out
}

/**
 * Soma por dia e preenche dias sem contato com 0 na janela [from, to].
 */
export function buildContactsPerDayChart(
  rows: ContactDayRow[],
  from: string,
  to: string,
): ChartDayPoint[] {
  const map = new Map<string, number>()
  for (const row of rows) {
    const key = toDayKey(row.day)
    if (!key) continue
    if (key < from || key > to) continue
    map.set(key, (map.get(key) ?? 0) + (Number(row.contacts_count) || 0))
  }
  return eachDayInclusive(from, to).map((day) => ({
    day,
    label: day.slice(5),
    total: map.get(day) ?? 0,
  }))
}
