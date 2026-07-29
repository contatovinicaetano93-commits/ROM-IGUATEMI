/**
 * Schema das despesas Omie em finance_expenses.
 * Idempotente — funciona com ou sem migrations.json (Iguatemi).
 */

import { getSql } from '@/lib/db'

let ensurePromise: Promise<void> | null = null

async function createOmieExpenseColumns(): Promise<void> {
  const sql = getSql()
  await sql`alter table finance_expenses add column if not exists source text not null default 'manual'`
  await sql`alter table finance_expenses add column if not exists external_id text`
  await sql`alter table finance_expenses add column if not exists omie_status text`
  await sql`alter table finance_expenses add column if not exists omie_category_code text`
  await sql`
    create unique index if not exists finance_expenses_source_external_uidx
      on finance_expenses (source, external_id)
      where external_id is not null
  `
  await sql`
    create index if not exists finance_expenses_source_idx
      on finance_expenses (source)
  `
}

export async function ensureOmieExpenseSchema(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = createOmieExpenseColumns().catch((e) => {
      ensurePromise = null
      throw e
    })
  }
  return ensurePromise
}

export interface OmieExpenseUpsertInput {
  externalId: string
  categoryId: string | null
  description: string
  amount: number
  expenseDate: string
  notes: string | null
  omieStatus: string
  omieCategoryCode: string | null
}

export async function upsertOmieExpense(
  input: OmieExpenseUpsertInput,
): Promise<{ id: string; created: boolean }> {
  const sql = getSql()
  const existing = (await sql`
    select id from finance_expenses
    where source = 'omie' and external_id = ${input.externalId}
    limit 1
  `) as { id: string }[]

  if (existing[0]) {
    await sql`
      update finance_expenses set
        category_id = ${input.categoryId},
        description = ${input.description},
        amount = ${input.amount},
        expense_date = ${input.expenseDate}::date,
        notes = ${input.notes},
        omie_status = ${input.omieStatus},
        omie_category_code = ${input.omieCategoryCode}
      where id = ${existing[0].id}
    `
    return { id: existing[0].id, created: false }
  }

  const rows = (await sql`
    insert into finance_expenses (
      category_id, description, amount, expense_date, notes,
      created_by, source, external_id, omie_status, omie_category_code
    ) values (
      ${input.categoryId},
      ${input.description},
      ${input.amount},
      ${input.expenseDate}::date,
      ${input.notes},
      'omie-sync',
      'omie',
      ${input.externalId},
      ${input.omieStatus},
      ${input.omieCategoryCode}
    )
    returning id
  `) as { id: string }[]

  return { id: rows[0]!.id, created: true }
}

export async function deleteOmieExpenseByExternalId(externalId: string): Promise<boolean> {
  const sql = getSql()
  const rows = (await sql`
    delete from finance_expenses
    where source = 'omie' and external_id = ${externalId}
    returning id
  `) as { id: string }[]
  return rows.length > 0
}

/** Remove despesas Omie do mês cujo título não veio mais na sync (ex.: cancelado fora do filtro). */
export async function pruneOmieExpensesMissingFromSync(
  from: string,
  to: string,
  keepExternalIds: Set<string>,
): Promise<number> {
  const sql = getSql()
  const rows = (await sql`
    select id, external_id from finance_expenses
    where source = 'omie'
      and expense_date >= ${from}::date
      and expense_date <= ${to}::date
      and external_id is not null
  `) as { id: string; external_id: string }[]

  let removed = 0
  for (const row of rows) {
    if (keepExternalIds.has(row.external_id)) continue
    await sql`delete from finance_expenses where id = ${row.id}`
    removed += 1
  }
  return removed
}
