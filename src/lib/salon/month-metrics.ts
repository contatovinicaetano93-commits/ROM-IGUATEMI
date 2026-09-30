import { getSql } from '@/lib/db'
import { todayIso } from '@/lib/salon/format'
import { statusLabelPt, type MonthCloseStatus } from '@/lib/salon/month-status'
import { resolveMonthWindow } from '@/lib/salon/month-window'

export type { MonthCloseStatus }
export { statusLabelPt }

const MONTH_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

let monthMetricsTableReady: Promise<void> | null = null

/** Garante a tabela de fechamento (migration 020 ou bootstrap em painéis sem runner). */
export async function ensureSalonMonthMetricsTable(): Promise<void> {
  if (!monthMetricsTableReady) {
    monthMetricsTableReady = (async () => {
      const sql = getSql()
      const exists = (await sql`
        select to_regclass('public.salon_month_metrics') is not null as ok
      `) as { ok: boolean }[]
      if (exists[0]?.ok) return

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
          revenue numeric(14, 2),
          attended int,
          cancelled int,
          no_shows int,
          appointments int,
          new_clients int,
          returning_clients int,
          ticket_avg numeric(12, 2),
          expenses numeric(14, 2),
          cmv numeric(14, 2),
          cash_flow numeric(14, 2),
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

export function monthRange(monthKey: string, referenceDay = todayIso()): { from: string; to: string } {
  const w = resolveMonthWindow(monthKey, referenceDay)
  return { from: w.from, to: w.to }
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

async function queryDailyTotals(from: string, to: string) {
  const sql = getSql()
  const rows = (await sql`
    select
      sum(revenue)::float as revenue,
      count(revenue)::int as revenue_days,
      sum(attended)::int as attended,
      count(attended)::int as attended_days,
      sum(cancelled)::int as cancelled,
      count(cancelled)::int as cancelled_days,
      sum(no_shows)::int as no_shows,
      count(no_shows)::int as no_show_days,
      sum(appointments)::int as appointments,
      count(appointments)::int as appointment_days,
      sum(new_clients)::int as new_clients,
      count(new_clients)::int as new_client_days,
      sum(returning_clients)::int as returning_clients,
      count(returning_clients)::int as returning_client_days
    from salon_daily_metrics
    where day >= ${from}::date and day <= ${to}::date
  `) as {
    revenue: number | null
    revenue_days: number
    attended: number | null
    attended_days: number
    cancelled: number | null
    cancelled_days: number
    no_shows: number | null
    no_show_days: number
    appointments: number | null
    appointment_days: number
    new_clients: number | null
    new_client_days: number
    returning_clients: number | null
    returning_client_days: number
  }[]
  const r = rows[0]
  const revenueDays = Number(r?.revenue_days ?? 0)
  // Sem dia com receita conhecida → null (não inventar R$0).
  const revenue =
    revenueDays > 0 ? Math.round(Number(r?.revenue ?? 0) * 100) / 100 : null
  const attendedDays = Number(r?.attended_days ?? 0)
  const attended = attendedDays > 0 ? Number(r?.attended ?? 0) || 0 : null
  const cancelledDays = Number(r?.cancelled_days ?? 0)
  const noShowDays = Number(r?.no_show_days ?? 0)
  const appointmentDays = Number(r?.appointment_days ?? 0)
  const newClientDays = Number(r?.new_client_days ?? 0)
  const returningClientDays = Number(r?.returning_client_days ?? 0)
  return {
    revenue,
    attended,
    cancelled: cancelledDays > 0 ? Number(r?.cancelled ?? 0) || 0 : null,
    no_shows: noShowDays > 0 ? Number(r?.no_shows ?? 0) || 0 : null,
    appointments: appointmentDays > 0 ? Number(r?.appointments ?? 0) || 0 : null,
    new_clients: newClientDays > 0 ? Number(r?.new_clients ?? 0) || 0 : null,
    returning_clients:
      returningClientDays > 0 ? Number(r?.returning_clients ?? 0) || 0 : null,
    ticket_avg:
      revenue != null && attended != null && attended > 0
        ? Math.round((revenue / attended) * 100) / 100
        : null,
  }
}

/** Soma operacional de salon_daily_metrics numa janela (MTD↔MTD / mês fechado). */
export async function sumSalonDailyRange(from: string, to: string) {
  return sumDailyTotals(from, to)
}

/** Despesas manuais ROM na janela (finance_expenses.expense_date). */
export async function sumSalonExpensesRange(from: string, to: string): Promise<number> {
  return sumExpenses(from, to)
}

/** CMV proxy (saídas de estoque) na janela. */
export async function sumSalonCmvRange(from: string, to: string): Promise<number> {
  return sumStockCogs(from, to)
}

async function sumDailyTotals(from: string, to: string) {
  try {
    const daily = await queryDailyTotals(from, to)
    // Materialização / soma operacional: coalesce só na gravação (NOT NULL legado).
    return {
      revenue: daily.revenue ?? 0,
      attended: daily.attended ?? 0,
      cancelled: daily.cancelled ?? 0,
      no_shows: daily.no_shows ?? 0,
      appointments: daily.appointments ?? 0,
      new_clients: daily.new_clients ?? 0,
      returning_clients: daily.returning_clients ?? 0,
      ticket_avg: daily.ticket_avg,
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

export interface SalonWindowTotals {
  revenue: number
  attended: number
  cancelled: number
  no_shows: number
  ticket_avg: number | null
  expenses: number
  cmv: number
  cash_flow: number
}

/**
 * Soma diária no recorte (MTD ou mês cheio). null se a query falhar ou se
 * nenhum dia tiver receita conhecida — o overview não deve trocar cache por R$ 0.
 */
export async function readSalonWindowTotals(
  from: string,
  to: string,
): Promise<SalonWindowTotals | null> {
  try {
    const daily = await queryDailyTotals(from, to)
    if (daily.revenue == null) return null
    const [expenses, cmv] = await Promise.all([sumExpenses(from, to), sumStockCogs(from, to)])
    return {
      revenue: daily.revenue,
      attended: daily.attended ?? 0,
      cancelled: daily.cancelled ?? 0,
      no_shows: daily.no_shows ?? 0,
      ticket_avg: daily.ticket_avg,
      expenses,
      cmv,
      cash_flow: Math.round((daily.revenue - expenses) * 100) / 100,
    }
  } catch {
    return null
  }
}

async function sumExpenses(from: string, to: string): Promise<number> {
  const sql = getSql()
  try {
    const rows = (await sql`
      select coalesce(sum(amount), 0)::float as total
      from finance_expenses
      where expense_date >= ${from}::date and expense_date <= ${to}::date
        and not (
          coalesce(source, 'manual') = 'omie'
          and (
            coalesce(omie_category_code, '') like '2.16%'
            or coalesce(omie_category_code, '') like '2.17%'
            or coalesce(omie_category_code, '') like '2.24%'
            or coalesce(omie_category_code, '') like '0.01%'
            or description ilike '%TED entre contas%'
            or description ilike '%Adiantamento de Lucro%'
            or description ilike '%Distribuição de Lucro%'
            or description ilike '%Distribuicao de Lucro%'
            or description ilike '%Mutuo %'
            or description ilike '%Mútuo %'
          )
        )
    `) as { total: number }[]
    return Math.round(Number(rows[0]?.total ?? 0) * 100) / 100
  } catch {
    try {
      const rows = (await sql`
        select coalesce(sum(amount), 0)::float as total
        from finance_expenses
        where expense_date >= ${from}::date and expense_date <= ${to}::date
          and description not ilike '%TED entre contas%'
          and description not ilike '%Adiantamento de Lucro%'
          and description not ilike '%Distribuição de Lucro%'
          and description not ilike '%Distribuicao de Lucro%'
          and description not ilike '%Mutuo %'
          and description not ilike '%Mútuo %'
      `) as { total: number }[]
      return Math.round(Number(rows[0]?.total ?? 0) * 100) / 100
    } catch {
      return 0
    }
  }
}

async function sumStockCogs(from: string, to: string): Promise<number> {
  const sql = getSql()
  try {
    // 0044 frequentemente manda cost=null nas saídas — fallback qty × custo do produto.
    const rows = (await sql`
      select coalesce(sum(
        coalesce(
          sm.cost,
          sm.quantity * coalesce(sp.unit_cost, sp.avg_cost, 0)
        )
      ), 0)::float as cmv
      from stock_movements sm
      left join stock_products sp on sp.id = sm.product_id
      where sm.type = 'saida'
        and sm.occurred_at >= (${from}::timestamp AT TIME ZONE 'America/Sao_Paulo')
        and sm.occurred_at < ((${to}::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
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
  const payloadJson = payload
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
      ${payloadJson},
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
