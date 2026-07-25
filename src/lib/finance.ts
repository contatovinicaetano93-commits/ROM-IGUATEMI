import { getSql } from '@/lib/db'
import {
  ensureFiscalSplitTable,
  getFiscalSplitSummary,
  type FiscalSplitSummary,
} from '@/lib/fiscal-split'
import { todayIso } from '@/lib/salon/format'
import { getPaymentMixRange, type P2PaymentRow } from '@/lib/salon/p2-metrics'

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

/**
 * Custo de mercadoria vendida (proxy): soma do custo das saídas de estoque no período
 * (Avec 0044 → stock_movements). Não é CMV fiscal completo.
 */
export interface CmvCoverage {
  /** Soma do CMV (custo movimento ou fallback produto). */
  cmv: number
  /** Total de saídas no período. */
  saidas_total: number
  /** Saídas com `stock_movements.cost` preenchido (> 0). */
  with_movement_cost: number
  /** Saídas sem cost na movimento, mas com custo no produto (unit/avg). */
  with_product_fallback: number
  /** Saídas sem custo útil (zeram no CMV). */
  with_zero: number
  /**
   * % das saídas com custo na própria saída (não fallback).
   * Null se não houver saídas.
   */
  movement_cost_pct: number | null
  /**
   * % das saídas com algum custo (movimento ou produto).
   * Null se não houver saídas.
   */
  any_cost_pct: number | null
}

export const EMPTY_CMV_COVERAGE: CmvCoverage = {
  cmv: 0,
  saidas_total: 0,
  with_movement_cost: 0,
  with_product_fallback: 0,
  with_zero: 0,
  movement_cost_pct: null,
  any_cost_pct: null,
}

async function sumStockCogs(from: string, to: string): Promise<CmvCoverage> {
  const sql = getSql()
  try {
    // 0044 frequentemente manda cost=null nas saídas — fallback qty × custo do produto.
    const rows = (await sql`
      select
        coalesce(sum(
          coalesce(
            sm.cost,
            sm.quantity * coalesce(sp.unit_cost, sp.avg_cost, 0)
          )
        ), 0)::float as cmv,
        count(*)::int as saidas_total,
        count(*) filter (
          where sm.cost is not null and sm.cost > 0
        )::int as with_movement_cost,
        count(*) filter (
          where (sm.cost is null or sm.cost <= 0)
            and coalesce(sp.unit_cost, sp.avg_cost, 0) > 0
        )::int as with_product_fallback,
        count(*) filter (
          where (sm.cost is null or sm.cost <= 0)
            and coalesce(sp.unit_cost, sp.avg_cost, 0) <= 0
        )::int as with_zero
      from stock_movements sm
      left join stock_products sp on sp.id = sm.product_id
      where sm.type = 'saida'
        and (sm.occurred_at at time zone 'America/Sao_Paulo')::date >= ${from}::date
        and (sm.occurred_at at time zone 'America/Sao_Paulo')::date <= ${to}::date
    `) as {
      cmv: number
      saidas_total: number
      with_movement_cost: number
      with_product_fallback: number
      with_zero: number
    }[]

    const row = rows[0]
    const saidas_total = Number(row?.saidas_total ?? 0) || 0
    const with_movement_cost = Number(row?.with_movement_cost ?? 0) || 0
    const with_product_fallback = Number(row?.with_product_fallback ?? 0) || 0
    const with_zero = Number(row?.with_zero ?? 0) || 0
    const pct = (n: number) =>
      saidas_total > 0 ? Math.round((n / saidas_total) * 1000) / 10 : null

    return {
      cmv: Math.round(Number(row?.cmv ?? 0) * 100) / 100,
      saidas_total,
      with_movement_cost,
      with_product_fallback,
      with_zero,
      movement_cost_pct: pct(with_movement_cost),
      any_cost_pct: pct(with_movement_cost + with_product_fallback),
    }
  } catch {
    return { ...EMPTY_CMV_COVERAGE }
  }
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
  /** CMV proxy: custo das saídas de estoque no mês. */
  cmv: number
  /** Cobertura do CMV: quantas saídas tinham custo real vs fallback vs zero. */
  cmv_coverage: CmvCoverage
  /** Margem após despesas e CMV: (receita − despesas − CMV) / receita. */
  margin_after_cmv: number | null
  /** (receita - despesas) / receita, em % — null se não houver receita no período. */
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
  const [revenue, expenses, payment_mix, fiscal_split, attended, daily, cmvCoverage] =
    await Promise.all([
      sumRevenue(from, to),
      sumExpenses(from, to),
      getPaymentMixRange(from, to),
      getFiscalSplitSummary(from, to),
      sumAttended(from, to),
      listDailyMetrics(from, to),
      sumStockCogs(from, to),
    ])
  const cmv = cmvCoverage.cmv
  const revenueRounded = Math.round(revenue * 100) / 100
  const expensesRounded = Math.round(expenses * 100) / 100
  const gross_margin =
    revenue > 0 ? Math.round(((revenue - expenses) / revenue) * 1000) / 10 : null
  const ticket_avg = attended > 0 ? Math.round((revenueRounded / attended) * 100) / 100 : null
  const margin_after_cmv =
    revenue > 0 ? Math.round(((revenue - expenses - cmv) / revenue) * 1000) / 10 : null

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
    cmv,
    cmv_coverage: cmvCoverage,
    margin_after_cmv,
    gross_margin,
    cash_flow: Math.round((revenue - expenses) * 100) / 100,
    payment_mix,
    payment_reconciliation: reconcileRevenueToPayments(revenueRounded, payment_mix),
    fiscal_split,
  }
}

/** KPIs do Financeiro. Receita vem de salon_daily_metrics (Avec); despesas são cadastro manual. */
export async function computeFinanceKpis(opts?: {
  month?: string
  compareMonth?: string
}): Promise<FinanceKpis> {
  await ensureFiscalSplitTable().catch(() => undefined)
  const current = opts?.month ?? currentMonthKey(todayIso())
  const compare = opts?.compareMonth ?? previousMonthKey(current)
  const [currentBucket, previousBucket] = await Promise.all([
    buildBucket(current),
    buildBucket(compare),
  ])
  return { current: currentBucket, previous: previousBucket }
}
