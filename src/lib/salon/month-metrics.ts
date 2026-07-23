import { getSql } from '@/lib/db'
import { todayIso } from '@/lib/salon/format'

const MONTH_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export type MonthCloseStatus = 'complete' | 'in_progress' | 'incomplete'

let monthMetricsTableReady: Promise<void> | null = null

/** Garante a tabela de fechamento (migration 020 ou bootstrap em painéis sem runner). */
export async function ensureSalonMonthMetricsTable(): Promise<void> {
  if (!monthMetricsTableReady) {
    monthMetricsTableReady = (async () => {
      const sql = getSql()
      await sql`
        create table if not exists salon_month_metrics (
          month text primary key,
          from_day date not null,
          to_day date not null,
          days_expected int not null default 0,
          days_present int not null default 0,
          days_missing text[] not null default '{}',
          status text not null default 'incomplete'
            check (status in ('complete', 'in_progress', 'incomplete')),
          revenue numeric(14, 2) not null default 0,
          attended int not null default 0,
          cancelled int not null default 0,
          no_shows int not null default 0,
          appointments int not null default 0,
          new_clients int not null default 0,
          returning_clients int not null default 0,
          ticket_avg numeric(12, 2),
          expenses numeric(14, 2) not null default 0,
          cmv numeric(14, 2) not null default 0,
          cash_flow numeric(14, 2) not null default 0,
          payload jsonb,
          materialized_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `
      await sql`
        create index if not exists salon_month_metrics_updated_idx
          on salon_month_metrics (updated_at desc)
      `
    })().catch((err) => {
      monthMetricsTableReady = null
      throw err
    })
  }
  await monthMetricsTableReady
}

export interface MonthCompleteness {
  month: string
  label: string
  from: string
  to: string
  /** Último dia considerado na checagem (ontem se mês atual; fim do mês se passado). */
  check_through: string
  days_expected: number
  days_present: number
  days_missing: string[]
  status: MonthCloseStatus
}

export interface SalonMonthMetricsRow {
  month: string
  from_day: string
  to_day: string
  days_expected: number
  days_present: number
  days_missing: string[]
  status: MonthCloseStatus
  revenue: number
  attended: number
  cancelled: number
  no_shows: number
  appointments: number
  new_clients: number
  returning_clients: number
  ticket_avg: number | null
  expenses: number
  cmv: number
  cash_flow: number
  payload: unknown
  materialized_at: string
  updated_at: string
}

export function monthKeyFromDay(day: string): string {
  return day.slice(0, 7)
}

export function labelMonthPt(monthKey: string): string {
  const [y, m] = monthKey.split('-')
  const idx = Number(m) - 1
  return `${MONTH_PT[idx] ?? m}/${y}`
}

export function monthRange(monthKey: string): { from: string; to: string } {
  const [y, m] = monthKey.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y!, m!, 0)).getUTCDate()
  return { from: `${monthKey}-01`, to: `${monthKey}-${String(lastDay).padStart(2, '0')}` }
}

function shiftDay(iso: string, delta: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

/** Lista YYYY-MM-DD inclusiva. */
export function listDaysInclusive(from: string, to: string): string[] {
  if (to < from) return []
  const out: string[] = []
  let cur = from
  while (cur <= to) {
    out.push(cur)
    cur = shiftDay(cur, 1)
  }
  return out
}

/**
 * Completude do mês a partir das linhas diárias.
 * Mês atual: checa até ontem (hoje ainda pode estar em sync).
 * Mês passado: checa o mês inteiro.
 */
export function computeMonthCompleteness(
  monthKey: string,
  presentDays: string[],
  today = todayIso(),
): MonthCompleteness {
  const { from, to } = monthRange(monthKey)
  const current = monthKeyFromDay(today)

  if (monthKey > current) {
    return {
      month: monthKey,
      label: labelMonthPt(monthKey),
      from,
      to,
      check_through: from,
      days_expected: 0,
      days_present: 0,
      days_missing: [],
      status: 'in_progress',
    }
  }

  const yesterday = shiftDay(today, -1)
  let check_through = to
  if (monthKey === current) {
    check_through = yesterday < from ? from : yesterday > to ? to : yesterday
  }

  const expected =
    monthKey === current && yesterday < from ? [] : listDaysInclusive(from, check_through)
  const presentSet = new Set(presentDays.map((d) => d.slice(0, 10)))
  const days_missing = expected.filter((d) => !presentSet.has(d))
  const days_present = expected.filter((d) => presentSet.has(d)).length

  let status: MonthCloseStatus
  if (monthKey === current) {
    status = days_missing.length === 0 ? 'in_progress' : 'incomplete'
  } else {
    status = days_missing.length === 0 ? 'complete' : 'incomplete'
  }

  return {
    month: monthKey,
    label: labelMonthPt(monthKey),
    from,
    to,
    check_through: expected.length ? check_through : from,
    days_expected: expected.length,
    days_present,
    days_missing,
    status,
  }
}

export function statusLabelPt(status: MonthCloseStatus): string {
  if (status === 'complete') return 'Completo'
  if (status === 'in_progress') return 'Em andamento'
  return 'INCOMPLETO'
}

async function listPresentDays(from: string, to: string): Promise<string[]> {
  const sql = getSql()
  try {
    const rows = (await sql`
      select day::text as day
      from salon_daily_metrics
      where day >= ${from}::date and day <= ${to}::date
      order by day asc
    `) as { day: string }[]
    return rows.map((r) => String(r.day).slice(0, 10))
  } catch {
    return []
  }
}

async function sumDailyTotals(from: string, to: string) {
  const sql = getSql()
  try {
    const rows = (await sql`
      select
        coalesce(sum(revenue), 0)::float as revenue,
        coalesce(sum(attended), 0)::int as attended,
        coalesce(sum(cancelled), 0)::int as cancelled,
        coalesce(sum(no_shows), 0)::int as no_shows,
        coalesce(sum(appointments), 0)::int as appointments,
        coalesce(sum(new_clients), 0)::int as new_clients,
        coalesce(sum(returning_clients), 0)::int as returning_clients
      from salon_daily_metrics
      where day >= ${from}::date and day <= ${to}::date
    `) as {
      revenue: number
      attended: number
      cancelled: number
      no_shows: number
      appointments: number
      new_clients: number
      returning_clients: number
    }[]
    const r = rows[0]
    const revenue = Math.round(Number(r?.revenue ?? 0) * 100) / 100
    const attended = Number(r?.attended ?? 0) || 0
    return {
      revenue,
      attended,
      cancelled: Number(r?.cancelled ?? 0) || 0,
      no_shows: Number(r?.no_shows ?? 0) || 0,
      appointments: Number(r?.appointments ?? 0) || 0,
      new_clients: Number(r?.new_clients ?? 0) || 0,
      returning_clients: Number(r?.returning_clients ?? 0) || 0,
      ticket_avg: attended > 0 ? Math.round((revenue / attended) * 100) / 100 : null,
    }
  } catch {
    return {
      revenue: 0,
      attended: 0,
      cancelled: 0,
      no_shows: 0,
      appointments: 0,
      new_clients: 0,
      returning_clients: 0,
      ticket_avg: null as number | null,
    }
  }
}

async function sumExpenses(from: string, to: string): Promise<number> {
  const sql = getSql()
  try {
    const rows = (await sql`
      select coalesce(sum(amount), 0)::float as total
      from finance_expenses
      where expense_date >= ${from}::date and expense_date <= ${to}::date
    `) as { total: number }[]
    return Math.round(Number(rows[0]?.total ?? 0) * 100) / 100
  } catch {
    return 0
  }
}

async function sumStockCogs(from: string, to: string): Promise<number> {
  const sql = getSql()
  try {
    const rows = (await sql`
      select coalesce(sum(coalesce(cost, 0)), 0)::float as cmv
      from stock_movements
      where type = 'saida'
        and (occurred_at at time zone 'America/Sao_Paulo')::date >= ${from}::date
        and (occurred_at at time zone 'America/Sao_Paulo')::date <= ${to}::date
    `) as { cmv: number }[]
    return Math.round(Number(rows[0]?.cmv ?? 0) * 100) / 100
  } catch {
    return 0
  }
}

export async function getMonthCompleteness(monthKey: string): Promise<MonthCompleteness> {
  const { from, to } = monthRange(monthKey)
  const present = await listPresentDays(from, to)
  return computeMonthCompleteness(monthKey, present)
}

export async function getSalonMonthMetrics(monthKey: string): Promise<SalonMonthMetricsRow | null> {
  const sql = getSql()
  try {
    const rows = (await sql`
      select * from salon_month_metrics where month = ${monthKey} limit 1
    `) as SalonMonthMetricsRow[]
    return rows[0] ?? null
  } catch {
    return null
  }
}

/**
 * Materializa o fechamento do mês a partir do acumulado diário ROM.
 * `payload` guarda o bloco analítico no momento do fechamento.
 */
export async function materializeSalonMonthMetrics(
  monthKey: string,
  payload: unknown = null,
): Promise<SalonMonthMetricsRow> {
  const sql = getSql()
  const { from, to } = monthRange(monthKey)
  const [completeness, totals, expenses, cmv] = await Promise.all([
    getMonthCompleteness(monthKey),
    sumDailyTotals(from, to),
    sumExpenses(from, to),
    sumStockCogs(from, to),
  ])
  const cash_flow = Math.round((totals.revenue - expenses) * 100) / 100
  const payloadJson = JSON.stringify(payload)
  const missingLiteral = `{${completeness.days_missing
    .map((d) => `"${String(d).replace(/"/g, '')}"`)
    .join(',')}}`

  const rows = (await sql`
    insert into salon_month_metrics (
      month, from_day, to_day, days_expected, days_present, days_missing, status,
      revenue, attended, cancelled, no_shows, appointments, new_clients, returning_clients,
      ticket_avg, expenses, cmv, cash_flow, payload, materialized_at, updated_at
    ) values (
      ${monthKey},
      ${from}::date,
      ${to}::date,
      ${completeness.days_expected},
      ${completeness.days_present},
      ${missingLiteral}::text[],
      ${completeness.status},
      ${totals.revenue},
      ${totals.attended},
      ${totals.cancelled},
      ${totals.no_shows},
      ${totals.appointments},
      ${totals.new_clients},
      ${totals.returning_clients},
      ${totals.ticket_avg},
      ${expenses},
      ${cmv},
      ${cash_flow},
      ${payloadJson}::jsonb,
      now(),
      now()
    )
    on conflict (month) do update set
      from_day = excluded.from_day,
      to_day = excluded.to_day,
      days_expected = excluded.days_expected,
      days_present = excluded.days_present,
      days_missing = excluded.days_missing,
      status = excluded.status,
      revenue = excluded.revenue,
      attended = excluded.attended,
      cancelled = excluded.cancelled,
      no_shows = excluded.no_shows,
      appointments = excluded.appointments,
      new_clients = excluded.new_clients,
      returning_clients = excluded.returning_clients,
      ticket_avg = excluded.ticket_avg,
      expenses = excluded.expenses,
      cmv = excluded.cmv,
      cash_flow = excluded.cash_flow,
      payload = excluded.payload,
      materialized_at = now(),
      updated_at = now()
    returning *
  `) as SalonMonthMetricsRow[]

  return rows[0]!
}
