import { getSql } from '@/lib/db'
import {
  ensureFiscalSplitTable,
  getFiscalSplitSummary,
  type FiscalSplitSummary,
} from '@/lib/fiscal-split'
import { omieFullMonthRange } from '@/lib/omie/dates'
import { isOmieNonOperatingExpense } from '@/lib/omie/expense-filter'
import { todayIso } from '@/lib/salon/format'
import { getPaymentMixRange, type P2PaymentRow } from '@/lib/salon/p2-metrics'
import { resolveMonthWindow, resolveComparableWindow } from '@/lib/salon/month-window'

/** true após o 1º ensureFiscalSplitTable bem-sucedido neste isolate. */
let fiscalTableReady = false

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
  source: 'manual' | 'omie' | string
  external_id: string | null
  omie_status: string | null
  /** CNPJ Omie de origem: servicos (salão) | comercio (produtos). */
  omie_cnpj_kind: 'servicos' | 'comercio' | null
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
  const keepOperating = (rows: FinanceExpense[]) =>
    rows.filter(
      (e) =>
        !isOmieNonOperatingExpense({
          source: e.source,
          description: e.description,
        }),
    )
  try {
    const rows = await sql`
      select
        id, category_id, description, amount::float as amount,
        expense_date::text as expense_date, notes, receipt_url, created_at,
        coalesce(source, 'manual') as source,
        external_id, omie_status, omie_cnpj_kind
      from finance_expenses
      where expense_date >= ${from}::date and expense_date <= ${to}::date
      order by expense_date desc, created_at desc
    `
    return keepOperating(rows as FinanceExpense[])
  } catch {
    try {
      const rows = await sql`
        select
          id, category_id, description, amount::float as amount,
          expense_date::text as expense_date, notes, receipt_url, created_at,
          coalesce(source, 'manual') as source,
          external_id, omie_status
        from finance_expenses
        where expense_date >= ${from}::date and expense_date <= ${to}::date
        order by expense_date desc, created_at desc
      `
      return keepOperating(
        (rows as Omit<FinanceExpense, 'omie_cnpj_kind'>[]).map((r) => ({
          ...r,
          omie_cnpj_kind: r.source === 'omie' ? 'servicos' : null,
        })),
      )
    } catch {
      const rows = await sql`
        select
          id, category_id, description, amount::float as amount,
          expense_date::text as expense_date, notes, receipt_url, created_at
        from finance_expenses
        where expense_date >= ${from}::date and expense_date <= ${to}::date
        order by expense_date desc, created_at desc
      `
      return keepOperating(
        (
          rows as Omit<FinanceExpense, 'source' | 'external_id' | 'omie_status' | 'omie_cnpj_kind'>[]
        ).map((r) => ({
          ...r,
          source: 'manual',
          external_id: null,
          omie_status: null,
          omie_cnpj_kind: null,
        })),
      )
    }
  }
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
  const row = rows[0]!
  return {
    ...row,
    source: row.source ?? 'manual',
    external_id: row.external_id ?? null,
    omie_status: row.omie_status ?? null,
    omie_cnpj_kind: row.omie_cnpj_kind ?? null,
  }
}

export async function deleteExpense(id: string): Promise<void> {
  const sql = getSql()
  try {
    const rows = (await sql`
      select coalesce(source, 'manual') as source from finance_expenses where id = ${id} limit 1
    `) as { source: string }[]
    if (rows[0]?.source === 'omie') {
      throw new Error('Despesa Omie não pode ser excluída aqui — cancele no Omie e rode o sync.')
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes('Despesa Omie')) throw e
  }
  await sql`delete from finance_expenses where id = ${id}`
}

/** Aceita YYYY-MM ou YYYY-MM-DD (usa só o mês). */
export function normalizeMonthKey(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  const key = trimmed.slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(key)) return null
  const month = Number(key.slice(5, 7))
  if (month < 1 || month > 12) return null
  return key
}

const MONTH_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function currentMonthKey(referenceDay: string): string {
  return referenceDay.slice(0, 7)
}

function monthRange(monthKey: string): { from: string; to: string } {
  // Mesma janela MTD da Visão analítica (mês corrente até hoje).
  const w = resolveMonthWindow(monthKey)
  return { from: w.from, to: w.to }
}

function labelMonthPt(monthKey: string): string {
  const [y, m] = monthKey.split('-')
  const idx = Number(m) - 1
  return `${MONTH_PT[idx] ?? m}/${y}`
}

async function sumRevenue(from: string, to: string): Promise<number | null> {
  const sql = getSql()
  const rows = (await sql`
    select
      sum(revenue) as revenue,
      count(revenue)::int as revenue_days
    from salon_daily_metrics
    where day >= ${from}::date and day <= ${to}::date
  `) as { revenue: string | number | null; revenue_days: number }[]
  const days = Number(rows[0]?.revenue_days ?? 0)
  if (days <= 0) return null
  return Number(rows[0]?.revenue ?? 0) || 0
}

async function sumExpenses(from: string, to: string): Promise<number> {
  const sql = getSql()
  try {
    const rows = (await sql`
      select coalesce(sum(amount), 0) as total
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
    `) as { total: string | number }[]
    return Number(rows[0]?.total ?? 0) || 0
  } catch {
    const rows = (await sql`
      select coalesce(sum(amount), 0) as total
      from finance_expenses
      where expense_date >= ${from}::date and expense_date <= ${to}::date
        and description not ilike '%TED entre contas%'
        and description not ilike '%Adiantamento de Lucro%'
        and description not ilike '%Distribuição de Lucro%'
        and description not ilike '%Distribuicao de Lucro%'
        and description not ilike '%Mutuo %'
        and description not ilike '%Mútuo %'
    `) as { total: string | number }[]
    return Number(rows[0]?.total ?? 0) || 0
  }
}

export interface ExpenseCnpjBreakdown {
  total: number
  servicos: number
  comercio: number
  manual: number
}

async function sumExpensesByCnpj(from: string, to: string): Promise<ExpenseCnpjBreakdown> {
  const sql = getSql()
  try {
    const rows = (await sql`
      select
        coalesce(sum(amount), 0)::float as total,
        coalesce(sum(amount) filter (
          where source = 'omie' and coalesce(omie_cnpj_kind, 'servicos') = 'servicos'
        ), 0)::float as servicos,
        coalesce(sum(amount) filter (
          where source = 'omie' and omie_cnpj_kind = 'comercio'
        ), 0)::float as comercio,
        coalesce(sum(amount) filter (
          where coalesce(source, 'manual') <> 'omie'
        ), 0)::float as manual
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
    `) as {
      total: number
      servicos: number
      comercio: number
      manual: number
    }[]
    const row = rows[0]
    return {
      total: Math.round(Number(row?.total ?? 0) * 100) / 100,
      servicos: Math.round(Number(row?.servicos ?? 0) * 100) / 100,
      comercio: Math.round(Number(row?.comercio ?? 0) * 100) / 100,
      manual: Math.round(Number(row?.manual ?? 0) * 100) / 100,
    }
  } catch {
    const total = await sumExpenses(from, to)
    return { total, servicos: 0, comercio: 0, manual: total }
  }
}

export interface FinanceDayPoint {
  day: string
  revenue: number
  attended: number
  ticket_avg: number | null
  /** Despesas Omie CNPJ serviços no dia (vencimento). */
  expenses_servicos: number
  /** Despesas Omie CNPJ comércio no dia (vencimento). */
  expenses_comercio: number
}

/** Une dias de receita Avec + dias só com despesa Omie (zeros onde faltar). */
export function mergeDailyFinanceSeries(
  metrics: Array<{ day: string; revenue: number; attended: number; ticket_avg: number | null }>,
  expenses: Array<{ day: string; servicos: number; comercio: number }>,
): FinanceDayPoint[] {
  const byDay = new Map<string, FinanceDayPoint>()
  for (const m of metrics) {
    const day = m.day.slice(0, 10)
    byDay.set(day, {
      day,
      revenue: Math.round(Number(m.revenue) * 100) / 100,
      attended: Number(m.attended) || 0,
      ticket_avg: m.ticket_avg != null ? Math.round(Number(m.ticket_avg) * 100) / 100 : null,
      expenses_servicos: 0,
      expenses_comercio: 0,
    })
  }
  for (const e of expenses) {
    const day = e.day.slice(0, 10)
    const existing = byDay.get(day)
    const servicos = Math.round(Number(e.servicos) * 100) / 100
    const comercio = Math.round(Number(e.comercio) * 100) / 100
    if (existing) {
      existing.expenses_servicos = servicos
      existing.expenses_comercio = comercio
    } else {
      byDay.set(day, {
        day,
        revenue: 0,
        attended: 0,
        ticket_avg: null,
        expenses_servicos: servicos,
        expenses_comercio: comercio,
      })
    }
  }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day))
}

async function listDailyOmieExpenses(
  from: string,
  to: string,
): Promise<Array<{ day: string; servicos: number; comercio: number }>> {
  const sql = getSql()
  try {
    const rows = (await sql`
      select
        expense_date::text as day,
        coalesce(sum(amount) filter (
          where coalesce(omie_cnpj_kind, 'servicos') = 'servicos'
        ), 0)::float as servicos,
        coalesce(sum(amount) filter (
          where omie_cnpj_kind = 'comercio'
        ), 0)::float as comercio
      from finance_expenses
      where source = 'omie'
        and expense_date >= ${from}::date
        and expense_date <= ${to}::date
        and not (
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
      group by expense_date
      order by expense_date asc
    `) as { day: string; servicos: number; comercio: number }[]
    return rows.map((r) => ({
      day: r.day.slice(0, 10),
      servicos: Number(r.servicos) || 0,
      comercio: Number(r.comercio) || 0,
    }))
  } catch {
    return []
  }
}

async function listDailyMetrics(from: string, to: string): Promise<FinanceDayPoint[]> {
  const sql = getSql()
  const [metricRows, expenseRows] = await Promise.all([
    (async () =>
      (await sql`
        select
          day::text as day,
          coalesce(revenue, 0)::float as revenue,
          coalesce(attended, 0)::int as attended,
          ticket_avg::float as ticket_avg
        from salon_daily_metrics
        where day >= ${from}::date and day <= ${to}::date
        order by day asc
      `) as { day: string; revenue: number; attended: number; ticket_avg: number | null }[])(),
    listDailyOmieExpenses(from, to),
  ])
  return mergeDailyFinanceSeries(metricRows, expenseRows)
}

async function sumAttended(from: string, to: string): Promise<number | null> {
  const sql = getSql()
  const rows = (await sql`
    select
      sum(attended)::float as attended,
      count(attended)::int as attended_days
    from salon_daily_metrics
    where day >= ${from}::date and day <= ${to}::date
  `) as { attended: number | null; attended_days: number }[]
  const days = Number(rows[0]?.attended_days ?? 0)
  if (days <= 0) return null
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
  /** true se a query de CMV falhou (não confundir com CMV zerado legítimo). */
  query_failed?: boolean
}

export const EMPTY_CMV_COVERAGE: CmvCoverage = {
  cmv: 0,
  saidas_total: 0,
  with_movement_cost: 0,
  with_product_fallback: 0,
  with_zero: 0,
  movement_cost_pct: null,
  any_cost_pct: null,
  query_failed: false,
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
        and sm.occurred_at >= (${from}::timestamp AT TIME ZONE 'America/Sao_Paulo')
        and sm.occurred_at < ((${to}::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
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
  } catch (e) {
    console.error('[finance] sumStockCogs failed', e)
    return { ...EMPTY_CMV_COVERAGE, query_failed: true }
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
  /**
   * Origem da receita do bucket:
   * - metrics = salon_daily_metrics
   * - payments_0081 = fallback quando métricas estão vazias mas 0081 tem valor
   * - empty = sem métricas nem pagamentos (ex.: dia 1 aguardando caixa)
   */
  revenue_source: 'metrics' | 'payments_0081' | 'empty'
  expenses: number
  /** Split por CNPJ Omie (serviços / comércio) + manuais. */
  expenses_by_cnpj: ExpenseCnpjBreakdown
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
  /** null quando ainda não há receita conhecida (não mostrar −despesas como “fluxo”). */
  cash_flow: number | null
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

async function buildBucket(
  monthKey: string,
  range?: { from: string; to: string; label?: string },
): Promise<FinanceKpiBucket> {
  const base = monthRange(monthKey)
  // Receita/CMV/0081: janela operacional (MTD no mês corrente).
  const from = range?.from ?? base.from
  const to = range?.to ?? base.to
  const label = range?.label ?? labelMonthPt(monthKey)
  // Despesas Omie: sempre mês calendário completo (mesma janela do sync por vencimento).
  const expenseRange = omieFullMonthRange(monthKey)
  const [metricsRevenue, expenseBreakdown, payment_mix, fiscal_split, attended, daily, cmvCoverage] =
    await Promise.all([
      sumRevenue(from, to),
      sumExpensesByCnpj(expenseRange.from, expenseRange.to),
      getPaymentMixRange(from, to),
      getFiscalSplitSummary(from, to),
      sumAttended(from, to),
      listDailyMetrics(expenseRange.from, expenseRange.to),
      sumStockCogs(from, to),
    ])
  const expenses = expenseBreakdown.total
  const cmv = cmvCoverage.cmv
  const paymentsTotal =
    Math.round(payment_mix.reduce((s, p) => s + Number(p.amount || 0), 0) * 100) / 100
  let revenue = metricsRevenue ?? 0
  let revenue_source: FinanceKpiBucket['revenue_source'] = 'metrics'
  if ((metricsRevenue == null || metricsRevenue <= 0) && paymentsTotal > 0) {
    revenue = paymentsTotal
    revenue_source = 'payments_0081'
  } else if (metricsRevenue == null || metricsRevenue <= 0) {
    revenue_source = 'empty'
    revenue = 0
  }
  const revenueRounded = Math.round(revenue * 100) / 100
  const expensesRounded = Math.round(expenses * 100) / 100
  const attendedKnown = attended ?? 0
  const gross_margin =
    revenue > 0 ? Math.round(((revenue - expenses) / revenue) * 1000) / 10 : null
  const ticket_avg =
    revenue_source === 'metrics' && attended != null && attended > 0
      ? Math.round((revenueRounded / attended) * 100) / 100
      : null
  const margin_after_cmv =
    revenue > 0 ? Math.round(((revenue - expenses - cmv) / revenue) * 1000) / 10 : null

  return {
    month: monthKey,
    label,
    from,
    to,
    revenue: revenueRounded,
    revenue_source,
    expenses: expensesRounded,
    expenses_by_cnpj: expenseBreakdown,
    attended: attendedKnown,
    ticket_avg,
    daily,
    cmv,
    cmv_coverage: cmvCoverage,
    margin_after_cmv,
    gross_margin,
    cash_flow:
      revenue_source === 'empty'
        ? null
        : Math.round((revenueRounded - expensesRounded) * 100) / 100,
    payment_mix,
    payment_reconciliation: reconcileRevenueToPayments(revenueRounded, payment_mix),
    fiscal_split,
  }
}

/** KPIs do Financeiro. Receita = Avec (métricas/0081); despesas = Omie (vencimento) + manuais. */
export async function computeFinanceKpis(opts?: {
  month?: string
  compareMonth?: string
}): Promise<FinanceKpis> {
  // Tabela fiscal: ensure só na 1ª leitura deste isolate (evita DDL a cada GET).
  if (!fiscalTableReady) {
    await ensureFiscalSplitTable().catch(() => undefined)
    fiscalTableReady = true
  }
  const current = opts?.month ?? currentMonthKey(todayIso())
  const currentWindow = resolveMonthWindow(current)
  const compareKey = opts?.compareMonth
  const prevWindow = resolveComparableWindow(
    currentWindow,
    compareKey && /^\d{4}-\d{2}$/.test(compareKey) ? compareKey : null,
  )
  const currentLabel = currentWindow.mtd
    ? `${labelMonthPt(current)} (até dia ${Number(currentWindow.to.slice(8, 10))})`
    : labelMonthPt(current)
  // Sequencial: reduz pico no pooler.
  const currentBucket = await buildBucket(current, {
    from: currentWindow.from,
    to: currentWindow.to,
    label: currentLabel,
  })
  const previousBucket = await buildBucket(prevWindow.month, {
    from: prevWindow.from,
    to: prevWindow.to,
    label: prevWindow.label,
  })
  return { current: currentBucket, previous: previousBucket }
}
