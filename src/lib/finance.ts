import { getSql } from '@/lib/db'
import {
  ensureFiscalSplitTable,
  getFiscalSplitSummary,
  type FiscalSplitSummary,
} from '@/lib/fiscal-split'
import { todayIso } from '@/lib/salon/format'
import {
  getPaymentMixRange,
  getSalonP2DailyNear,
  type P2ChannelRow,
  type P2PackageRow,
  type P2PaymentRow,
} from '@/lib/salon/p2-metrics'
import {
  getSalonP1DailyNear,
  type P1AcquisitionRow,
  type P1ProfessionalRow,
  type P1ServiceRow,
} from '@/lib/salon/p1-metrics'
import { getSalonP3DailyNear } from '@/lib/salon/p3-metrics'

export interface FinanceCategory {
  id: string
  name: string
  active: boolean
  created_at: string
}

export interface FinanceExpense {
  id: string
  category_id: string | null
  description: string
  amount: number
  expense_date: string
  notes: string | null
  receipt_url: string | null
  created_at: string
}

export async function listCategories(activeOnly = true): Promise<FinanceCategory[]> {
  const sql = getSql()
  const rows = activeOnly
    ? await sql`select * from finance_categories where active = true order by name asc`
    : await sql`select * from finance_categories order by name asc`
  return rows as FinanceCategory[]
}

export async function createCategory(name: string): Promise<FinanceCategory> {
  const sql = getSql()
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Nome da categoria é obrigatório')

  const existing = (await sql`
    select * from finance_categories where lower(name) = lower(${trimmed}) and active = true limit 1
  `) as FinanceCategory[]
  if (existing[0]) return existing[0]

  const rows = (await sql`
    insert into finance_categories (name) values (${trimmed}) returning *
  `) as FinanceCategory[]
  return rows[0]!
}

export async function deactivateCategory(id: string): Promise<void> {
  const sql = getSql()
  await sql`update finance_categories set active = false where id = ${id}`
}

export interface CreateExpenseInput {
  categoryId: string | null
  description: string
  amount: number
  expenseDate: string
  notes?: string | null
  receiptUrl?: string | null
  createdBy?: string | null
}

export async function listExpenses(from: string, to: string): Promise<FinanceExpense[]> {
  const sql = getSql()
  const rows = await sql`
    select
      id, category_id, description, amount::float as amount,
      expense_date::text as expense_date, notes, receipt_url, created_at
    from finance_expenses
    where expense_date >= ${from}::date and expense_date <= ${to}::date
    order by expense_date desc, created_at desc
  `
  return rows as FinanceExpense[]
}

export async function createExpense(input: CreateExpenseInput): Promise<FinanceExpense> {
  const sql = getSql()
  const description = input.description.trim()
  if (!description) throw new Error('Descrição é obrigatória')
  if (!(input.amount > 0)) throw new Error('Valor precisa ser maior que zero')

  const rows = (await sql`
    insert into finance_expenses (category_id, description, amount, expense_date, notes, receipt_url, created_by)
    values (
      ${input.categoryId}, ${description}, ${input.amount}, ${input.expenseDate}::date,
      ${input.notes ?? null}, ${input.receiptUrl ?? null}, ${input.createdBy ?? null}
    )
    returning
      id, category_id, description, amount::float as amount,
      expense_date::text as expense_date, notes, receipt_url, created_at
  `) as FinanceExpense[]
  return rows[0]
}

export async function deleteExpense(id: string): Promise<void> {
  const sql = getSql()
  await sql`delete from finance_expenses where id = ${id}`
}

const MONTH_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function currentMonthKey(referenceDay: string): string {
  return referenceDay.slice(0, 7)
}

function previousMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  const d = new Date(Date.UTC(y!, m! - 2, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function monthRange(monthKey: string): { from: string; to: string } {
  const [y, m] = monthKey.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y!, m!, 0)).getUTCDate()
  return { from: `${monthKey}-01`, to: `${monthKey}-${String(lastDay).padStart(2, '0')}` }
}

function labelMonthPt(monthKey: string): string {
  const [y, m] = monthKey.split('-')
  const idx = Number(m) - 1
  return `${MONTH_PT[idx] ?? m}/${y}`
}

async function sumRevenue(from: string, to: string): Promise<number> {
  const sql = getSql()
  const rows = (await sql`
    select coalesce(sum(revenue), 0) as revenue
    from salon_daily_metrics
    where day >= ${from}::date and day <= ${to}::date
  `) as { revenue: string | number }[]
  return Number(rows[0]?.revenue ?? 0) || 0
}

async function sumExpenses(from: string, to: string): Promise<number> {
  const sql = getSql()
  const rows = (await sql`
    select coalesce(sum(amount), 0) as total
    from finance_expenses
    where expense_date >= ${from}::date and expense_date <= ${to}::date
  `) as { total: string | number }[]
  return Number(rows[0]?.total ?? 0) || 0
}

export interface FinanceDayPoint {
  day: string
  revenue: number
  attended: number
  ticket_avg: number | null
}

async function listDailyMetrics(from: string, to: string): Promise<FinanceDayPoint[]> {
  const sql = getSql()
  const rows = (await sql`
    select
      day::text as day,
      coalesce(revenue, 0)::float as revenue,
      coalesce(attended, 0)::int as attended,
      ticket_avg::float as ticket_avg
    from salon_daily_metrics
    where day >= ${from}::date and day <= ${to}::date
    order by day asc
  `) as { day: string; revenue: number; attended: number; ticket_avg: number | null }[]
  return rows.map((r) => ({
    day: r.day,
    revenue: Math.round(Number(r.revenue) * 100) / 100,
    attended: Number(r.attended) || 0,
    ticket_avg: r.ticket_avg != null ? Math.round(Number(r.ticket_avg) * 100) / 100 : null,
  }))
}

async function sumAttended(from: string, to: string): Promise<number> {
  const sql = getSql()
  const rows = (await sql`
    select coalesce(sum(attended), 0)::int as attended
    from salon_daily_metrics
    where day >= ${from}::date and day <= ${to}::date
  `) as { attended: number }[]
  return Number(rows[0]?.attended ?? 0) || 0
}

export interface AttendanceLossTotals {
  cancelled: number
  no_shows: number
}

async function sumAttendanceLoss(from: string, to: string): Promise<AttendanceLossTotals> {
  const sql = getSql()
  try {
    const rows = (await sql`
      select
        coalesce(sum(cancelled), 0)::int as cancelled,
        coalesce(sum(no_shows), 0)::int as no_shows
      from salon_daily_metrics
      where day >= ${from}::date and day <= ${to}::date
    `) as AttendanceLossTotals[]
    return {
      cancelled: Number(rows[0]?.cancelled ?? 0) || 0,
      no_shows: Number(rows[0]?.no_shows ?? 0) || 0,
    }
  } catch {
    return { cancelled: 0, no_shows: 0 }
  }
}

/**
 * Custo de mercadoria vendida (proxy): soma do custo das saídas de estoque no período
 * (Avec 0044 → stock_movements). Não é CMV fiscal completo.
 */
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

/** Média de ocupação 0–1 a partir do ranking 0126 (ponderada por atendidos quando disponível). */
export function averageOccupancy(professionals: P1ProfessionalRow[]): number | null {
  if (!professionals.length) return null
  let weighted = 0
  let weight = 0
  let simple = 0
  let count = 0
  for (const p of professionals) {
    const occ = Number(p.occupancy)
    if (!(occ >= 0) || Number.isNaN(occ)) continue
    simple += occ
    count += 1
    const w = Math.max(0, Number(p.attended) || 0)
    if (w > 0) {
      weighted += occ * w
      weight += w
    }
  }
  if (count === 0) return null
  const avg = weight > 0 ? weighted / weight : simple / count
  return Math.round(avg * 1000) / 1000
}

/** Receita perdida estimada: (cancelados + no-shows) × ticket médio. */
export function estimateLostRevenue(
  cancelled: number,
  noShows: number,
  ticketAvg: number | null,
): number {
  if (ticketAvg == null || !(ticketAvg > 0)) return 0
  const lost = (Math.max(0, cancelled) + Math.max(0, noShows)) * ticketAvg
  return Math.round(lost * 100) / 100
}

export interface PaymentReconciliation {
  revenue: number
  payments_total: number
  delta: number
  /** Tolerância: máx(R$ 1, 1% da receita). */
  tolerance: number
  status: 'aligned' | 'divergent' | 'missing_payments' | 'missing_revenue'
}

export function reconcileRevenueToPayments(
  revenue: number,
  payment_mix: P2PaymentRow[],
): PaymentReconciliation {
  const payments_total =
    Math.round(payment_mix.reduce((s, p) => s + Number(p.amount || 0), 0) * 100) / 100
  const delta = Math.round((payments_total - revenue) * 100) / 100
  const tolerance = Math.max(1, Math.round(revenue * 0.01 * 100) / 100)

  let status: PaymentReconciliation['status']
  if (payments_total <= 0 && revenue > 0) status = 'missing_payments'
  else if (revenue <= 0 && payments_total > 0) status = 'missing_revenue'
  else if (Math.abs(delta) > tolerance) status = 'divergent'
  else status = 'aligned'

  return { revenue, payments_total, delta, tolerance, status }
}

export interface FinanceKpiBucket {
  month: string
  label: string
  from: string
  to: string
  revenue: number
  expenses: number
  /** Proxy de comandas finalizadas (métrica attended da Avec/Lake). */
  attended: number
  /** Ticket médio do período (receita ÷ atendidos). */
  ticket_avg: number | null
  /** Série diária do mês (salon_daily_metrics — Avec sync + seed Lake). */
  daily: FinanceDayPoint[]
  /** Ranking 0021 (janela rolante ~30d no snapshot P1 mais próximo do fim do mês). */
  top_professionals: P1ProfessionalRow[]
  /** Ranking 0032 (mesmo snapshot P1). */
  top_services: P1ServiceRow[]
  /** Ocupação média 0–1 (Avec 0126 no snapshot P1). */
  occupancy_avg: number | null
  /** Cancelamentos no mês (Avec 0052 → salon_daily_metrics). */
  cancelled: number
  /** No-shows no mês (Avec 0052). */
  no_shows: number
  /** Estimativa (cancelled + no_shows) × ticket_avg. */
  lost_revenue: number
  /** CMV proxy: custo das saídas de estoque no mês. */
  cmv: number
  /** Margem após despesas e CMV: (receita − despesas − CMV) / receita. */
  margin_after_cmv: number | null
  /** Pacotes Avec 0061 (snapshot P2 ~30d). */
  packages: P2PackageRow[]
  packages_sold: number
  packages_revenue: number
  /** Canais de agenda Avec 0056 (snapshot P2). */
  booking_channels: P2ChannelRow[]
  /** Como nos conheceram Avec 0003 (snapshot P1). */
  acquisition: P1AcquisitionRow[]
  /** Taxa de retorno Avec 0007 (0–1, snapshot P3). */
  return_rate: number | null
  /** Novos no período Avec 0017 (snapshot P3). */
  new_clients_period: number
  /** (receita - despesas) / receita, em % — null se não houver receita no período (Avec ainda não sincronizou). */
  gross_margin: number | null
  cash_flow: number
  /** Breakdown por forma de pagamento (relatório 0081 da Avec) — reconciliação. */
  payment_mix: P2PaymentRow[]
  /** Receita (métricas) vs soma das formas de pagamento (0081). */
  payment_reconciliation: PaymentReconciliation
  /** Conciliação CBS/IBS retidos no split fiscal (Plataforma Pública / export PSP). */
  fiscal_split: FiscalSplitSummary
}

export interface FinanceKpis {
  current: FinanceKpiBucket
  previous: FinanceKpiBucket
}

async function buildBucket(monthKey: string): Promise<FinanceKpiBucket> {
  const { from, to } = monthRange(monthKey)
  const [revenue, expenses, payment_mix, fiscal_split, attended, daily, p1, p2, p3, loss, cmv] =
    await Promise.all([
      sumRevenue(from, to),
      sumExpenses(from, to),
      getPaymentMixRange(from, to),
      getFiscalSplitSummary(from, to),
      sumAttended(from, to),
      listDailyMetrics(from, to),
      getSalonP1DailyNear(to),
      getSalonP2DailyNear(to),
      getSalonP3DailyNear(to),
      sumAttendanceLoss(from, to),
      sumStockCogs(from, to),
    ])
  const revenueRounded = Math.round(revenue * 100) / 100
  const expensesRounded = Math.round(expenses * 100) / 100
  const gross_margin =
    revenue > 0 ? Math.round(((revenue - expenses) / revenue) * 1000) / 10 : null
  const ticket_avg = attended > 0 ? Math.round((revenueRounded / attended) * 100) / 100 : null
  const professionals = p1?.professionals ?? []
  const packages = (p2?.packages ?? []).slice(0, 10)
  const packages_revenue =
    Math.round(packages.reduce((s, p) => s + Number(p.revenue || 0), 0) * 100) / 100
  const lost_revenue = estimateLostRevenue(loss.cancelled, loss.no_shows, ticket_avg)
  const margin_after_cmv =
    revenue > 0
      ? Math.round(((revenue - expenses - cmv) / revenue) * 1000) / 10
      : null
  const return_rate = p3 != null ? Number(p3.return_rate) : null

  return {
    month: monthKey,
    label: labelMonthPt(monthKey),
    from,
    to,
    revenue: revenueRounded,
    expenses: expensesRounded,
    attended,
    ticket_avg,
    daily,
    top_professionals: professionals.slice(0, 8),
    top_services: (p1?.services ?? []).slice(0, 8),
    occupancy_avg: averageOccupancy(professionals),
    cancelled: loss.cancelled,
    no_shows: loss.no_shows,
    lost_revenue,
    cmv,
    margin_after_cmv,
    packages,
    packages_sold: Number(p2?.packages_sold ?? 0) || 0,
    packages_revenue,
    booking_channels: (p2?.booking_channels ?? []).slice(0, 10),
    acquisition: (p1?.acquisition ?? []).slice(0, 10),
    return_rate,
    new_clients_period: Number(p3?.new_clients_period ?? 0) || 0,
    gross_margin,
    cash_flow: Math.round((revenue - expenses) * 100) / 100,
    payment_mix,
    payment_reconciliation: reconcileRevenueToPayments(revenueRounded, payment_mix),
    fiscal_split,
  }
}

/** KPIs do Financeiro (Sprint 4). Receita vem de salon_daily_metrics (Avec); despesas são cadastro manual. */
export async function computeFinanceKpis(opts?: {
  month?: string
  compareMonth?: string
}): Promise<FinanceKpis> {
  // Uma vez por request (memoizado no módulo) — evita DDL paralelo nos dois buckets.
  await ensureFiscalSplitTable().catch(() => undefined)
  const current = opts?.month ?? currentMonthKey(todayIso())
  const compare = opts?.compareMonth ?? previousMonthKey(current)
  const [currentBucket, previousBucket] = await Promise.all([
    buildBucket(current),
    buildBucket(compare),
  ])
  return { current: currentBucket, previous: previousBucket }
}
