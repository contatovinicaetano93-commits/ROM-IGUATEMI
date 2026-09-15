import 'server-only'

import { getSql } from '@/lib/db'
import { getRomPanelId } from '@/lib/brand'
import { companiesForPanel, FLOW_CATEGORIES, isCompanyAllowedOnPanel } from '@/lib/intranet/companies'
import { asJsonObject } from '@/lib/jsonb'
import { AuditLogger } from '@/lib/audit'
import type {
  Category,
  Company,
  Expense,
  FinanceActionPayload,
  PaymentMethod,
  RequestAction,
  StoredFile,
  User,
} from '@/lib/flow/types'
import {
  allowedActions,
  canSeeExpense,
  initialStatus,
  nextStatus,
  parseArea,
  parseExpenseType,
  parseStatus,
  validateEventDate,
  validatePaymentDate,
  withEventDateObservation,
} from '@/lib/flow/workflow'

type ExpenseRow = Record<string, unknown>

function isMissingRelation(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  return /flow_companies|flow_expenses|does not exist|relation/i.test(msg)
}

export async function ensureFlowCatalog(): Promise<void> {
  const sql = getSql()
  const panel = getRomPanelId()
  try {
    for (const company of companiesForPanel(panel)) {
      await sql`
        insert into flow_companies (id, name, legal_name, slug, initials, color, is_active)
        values (
          ${company.id},
          ${company.name},
          ${company.legal_name},
          ${company.slug},
          ${company.initials},
          ${company.color},
          ${company.is_active}
        )
        on conflict (id) do update set
          name = excluded.name,
          legal_name = excluded.legal_name,
          slug = excluded.slug,
          initials = excluded.initials,
          color = excluded.color,
          is_active = excluded.is_active
      `
    }
    for (const category of FLOW_CATEGORIES) {
      await sql`
        insert into flow_categories (id, name, color, is_active)
        values (${category.id}, ${category.name}, ${category.color}, ${category.is_active})
        on conflict (id) do nothing
      `
    }
  } catch (error) {
    if (isMissingRelation(error)) return
    throw error
  }
}

export async function listFlowCompanies(): Promise<Company[]> {
  await ensureFlowCatalog()
  const sql = getSql()
  const panel = getRomPanelId()
  const allowed = new Set(companiesForPanel(panel).map((c) => c.id))
  try {
    const rows = (await sql`select * from flow_companies where is_active = true order by name`) as ExpenseRow[]
    return rows
      .map(mapCompany)
      .filter((company) => allowed.has(company.id))
  } catch (error) {
    if (isMissingRelation(error)) return companiesForPanel(panel)
    throw error
  }
}

export async function listFlowCategories(): Promise<Category[]> {
  await ensureFlowCatalog()
  const sql = getSql()
  try {
    const rows = (await sql`select * from flow_categories where is_active = true order by name`) as ExpenseRow[]
    return rows.map(mapCategory)
  } catch (error) {
    if (isMissingRelation(error)) {
      return FLOW_CATEGORIES.map((c) => ({ ...c }))
    }
    throw error
  }
}

export async function listVisibleExpenses(user: User): Promise<Expense[]> {
  await ensureFlowCatalog()
  const sql = getSql()
  const panel = getRomPanelId()
  try {
    const rows = (await sql`
      select * from flow_expenses order by created_at desc limit 300
    `) as ExpenseRow[]
    return rows
      .map(mapExpense)
      .filter((expense) => isCompanyAllowedOnPanel(panel, expense.company))
      .filter((expense) => canSeeExpense(user, expense))
  } catch (error) {
    if (isMissingRelation(error)) return []
    throw error
  }
}

export async function getExpense(id: string, user: User): Promise<Expense | null> {
  const items = await listVisibleExpenses(user)
  return items.find((item) => item.id === id) ?? null
}

export async function createExpense(
  user: User,
  input: Omit<Expense, 'id' | 'created' | 'updated' | 'requester' | 'approver' | 'status' | 'review_note'> & {
    status?: Expense['status']
    review_note?: string
  },
): Promise<Expense> {
  await ensureFlowCatalog()
  const panel = getRomPanelId()
  if (!isCompanyAllowedOnPanel(panel, input.company)) {
    throw new Error('Empresa fora desta unidade.')
  }
  if (!user.companyIds.includes(input.company)) {
    throw new Error('Sem permissão nesta empresa.')
  }
  validateEventDate(input.expense_type, input.event_date)
  validatePaymentDate(input.expense_type, input.max_payment_date, input.payment_date_justification)
  const now = new Date().toISOString()
  const expense: Expense = {
    ...input,
    id: crypto.randomUUID(),
    description: withEventDateObservation(input.description, input.expense_type, input.event_date),
    requester: user.id,
    approver: null,
    status: input.status ?? initialStatus(input.area),
    review_note: input.review_note ?? '',
    created: now,
    updated: now,
  }
  const sql = getSql()
  await sql`
    insert into flow_expenses (
      id, title, description, area, expense_type, event_project, event_date, amount, category,
      payment_method, beneficiary_name, beneficiary_document, pix_key, bank_name, agency, account,
      boleto_code, max_payment_date, payment_date_justification, receipt_justification, receipt,
      payment_proof, company_id, requester_id, approver_id, status, scheduled_date, review_note,
      created_at, updated_at
    ) values (
      ${expense.id}, ${expense.title}, ${expense.description}, ${expense.area}, ${expense.expense_type},
      ${expense.event_project}, ${expense.event_date}, ${expense.amount}, ${expense.category},
      ${expense.payment_method}, ${expense.beneficiary_name}, ${expense.beneficiary_document},
      ${expense.pix_key}, ${expense.bank_name}, ${expense.agency}, ${expense.account},
      ${expense.boleto_code}, ${expense.max_payment_date}, ${expense.payment_date_justification},
      ${expense.receipt_justification}, ${expense.receipt ? JSON.stringify(expense.receipt) : null}::jsonb,
      ${expense.payment_proof ? JSON.stringify(expense.payment_proof) : null}::jsonb,
      ${expense.company}, ${expense.requester}, ${expense.approver}, ${expense.status},
      ${expense.scheduled_date}, ${expense.review_note}, ${now}::timestamptz, ${now}::timestamptz
    )
  `
  await AuditLogger.log(user.email, user.role, 'CREATE_EXPENSE', `flow:${expense.id}`, {
    title: expense.title,
    company: expense.company,
    area: expense.area,
    amount: expense.amount,
  })
  return expense
}

export async function applyExpenseAction(
  user: User,
  expenseId: string,
  action: RequestAction,
  payload: FinanceActionPayload = {},
): Promise<Expense> {
  const current = await getExpense(expenseId, user)
  if (!current) throw new Error('Solicitação não encontrada.')
  if (!allowedActions(user, current).includes(action)) {
    throw new Error('Ação não permitida nesta solicitação.')
  }
  const next = nextStatus(action, current)
  const now = new Date().toISOString()
  const updated: Expense = {
    ...current,
    status: next,
    review_note: payload.note?.trim() ? payload.note.trim() : current.review_note,
    receipt: payload.receipt ?? current.receipt,
    payment_proof: payload.proof ?? current.payment_proof,
    approver: action === 'approve' ? user.id : current.approver,
    updated: now,
  }
  const sql = getSql()
  await sql`
    update flow_expenses set
      status = ${updated.status},
      review_note = ${updated.review_note},
      receipt = ${updated.receipt ? JSON.stringify(updated.receipt) : null}::jsonb,
      payment_proof = ${updated.payment_proof ? JSON.stringify(updated.payment_proof) : null}::jsonb,
      approver_id = ${updated.approver},
      updated_at = ${now}::timestamptz
    where id = ${updated.id}
  `
  await AuditLogger.log(user.email, user.role, action.toUpperCase(), `flow:${updated.id}`, {
    from: current.status,
    to: updated.status,
    note: payload.note ?? null,
  })
  return updated
}

function mapCompany(row: ExpenseRow): Company {
  return {
    id: String(row.id),
    name: String(row.name),
    legal_name: String(row.legal_name ?? row.legalName ?? row.name),
    slug: String(row.slug),
    initials: String(row.initials),
    color: String(row.color),
    is_active: row.is_active !== false,
  }
}

function mapCategory(row: ExpenseRow): Category {
  return {
    id: String(row.id),
    name: String(row.name),
    color: String(row.color),
    is_active: row.is_active !== false,
  }
}

function mapExpense(row: ExpenseRow): Expense {
  return {
    id: String(row.id),
    title: String(row.title),
    description: String(row.description ?? ''),
    area: parseArea(row.area),
    expense_type: parseExpenseType(row.expense_type),
    event_project: String(row.event_project ?? ''),
    event_date: String(row.event_date ?? ''),
    amount: Number(row.amount) || 0,
    category: String(row.category),
    payment_method: (row.payment_method as PaymentMethod) || 'pix',
    beneficiary_name: String(row.beneficiary_name ?? ''),
    beneficiary_document: String(row.beneficiary_document ?? ''),
    pix_key: String(row.pix_key ?? ''),
    bank_name: String(row.bank_name ?? ''),
    agency: String(row.agency ?? ''),
    account: String(row.account ?? ''),
    boleto_code: String(row.boleto_code ?? ''),
    max_payment_date: String(row.max_payment_date ?? ''),
    payment_date_justification: String(row.payment_date_justification ?? ''),
    receipt_justification: String(row.receipt_justification ?? ''),
    receipt: asJsonObject<StoredFile>(row.receipt),
    payment_proof: asJsonObject<StoredFile>(row.payment_proof),
    company: String(row.company_id ?? row.company),
    requester: String(row.requester_id ?? row.requester),
    approver: row.approver_id ? String(row.approver_id) : null,
    status: parseStatus(row.status),
    scheduled_date: row.scheduled_date ? String(row.scheduled_date) : null,
    review_note: String(row.review_note ?? ''),
    created: String(row.created_at ?? row.created ?? ''),
    updated: String(row.updated_at ?? row.updated ?? ''),
  }
}
