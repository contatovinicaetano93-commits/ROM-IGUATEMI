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

  const rows = await sql`
    insert into finance_expenses (category_id, description, amount, expense_date, notes, receipt_url, created_by)
    values (
      ${input.categoryId}, ${description}, ${input.amount}, ${input.expenseDate}::date,
      ${input.notes ?? null}, ${input.receiptUrl ?? null}, ${input.createdBy ?? null}
    )
    returning
      id, category_id, description, amount::float as amount,
      expense_date::text as expense_date, notes, receipt_url, created_at
  `
  return rows[0] as FinanceExpense
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

export interface FinanceKpiBucket {
  month: string
  label: string
  from: string
  to: string
  revenue: number
  expenses: number
  /** (receita - despesas) / receita, em % — null se não houver receita no período (Avec ainda não sincronizou). */
  gross_margin: number | null
  cash_flow: number
  /** Breakdown por forma de pagamento (relatório 0081 da Avec) — reconciliação. */
  payment_mix: P2PaymentRow[]
  /** Conciliação CBS/IBS retidos no split fiscal (Plataforma Pública / export PSP). */
  fiscal_split: FiscalSplitSummary
}

export interface FinanceKpis {
  current: FinanceKpiBucket
  previous: FinanceKpiBucket
}

async function buildBucket(monthKey: string): Promise<FinanceKpiBucket> {
  const { from, to } = monthRange(monthKey)
  const [revenue, expenses, payment_mix, fiscal_split] = await Promise.all([
    sumRevenue(from, to),
    sumExpenses(from, to),
    getPaymentMixRange(from, to),
    getFiscalSplitSummary(from, to),
  ])
  const gross_margin = revenue > 0 ? Math.round(((revenue - expenses) / revenue) * 1000) / 10 : null
  return {
    month: monthKey,
    label: labelMonthPt(monthKey),
    from,
    to,
    revenue: Math.round(revenue * 100) / 100,
    expenses: Math.round(expenses * 100) / 100,
    gross_margin,
    cash_flow: Math.round((revenue - expenses) * 100) / 100,
    payment_mix,
    fiscal_split,
  }
}

/** KPIs do Financeiro (Sprint 4). Receita vem de salon_daily_metrics (Avec); despesas são cadastro manual. */
export async function computeFinanceKpis(opts?: { month?: string; compareMonth?: string }): Promise<FinanceKpis> {
  // Uma vez por request (memoizado no módulo) — evita DDL paralelo nos dois buckets.
  await ensureFiscalSplitTable().catch(() => undefined)
  const current = opts?.month ?? currentMonthKey(todayIso())
  const compare = opts?.compareMonth ?? previousMonthKey(current)
  const [currentBucket, previousBucket] = await Promise.all([buildBucket(current), buildBucket(compare)])
  return { current: currentBucket, previous: previousBucket }
}
