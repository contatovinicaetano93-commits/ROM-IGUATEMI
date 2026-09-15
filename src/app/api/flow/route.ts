import { NextRequest } from 'next/server'
import { err, ok } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { resolveFlowUser } from '@/lib/flow/from-session'
import { listFlowCategories, listFlowCompanies, listVisibleExpenses, createExpense } from '@/lib/flow/store'
import { persistStoredFile } from '@/lib/flow/files'
import { notifyIntranet } from '@/lib/cms'
import { parseArea, parseExpenseType, canAccessArea } from '@/lib/flow/workflow'
import type { PaymentMethod, StoredFile } from '@/lib/flow/types'

export async function GET(req: NextRequest) {
  const auth = await requireSession(req)
  if (!auth.ok) return err(auth.message, auth.status)
  const user = await resolveFlowUser(auth.session)
  try {
    const [companies, categories, expenses] = await Promise.all([
      listFlowCompanies(),
      listFlowCategories(),
      listVisibleExpenses(user),
    ])
    return ok({ companies, categories, expenses, user })
  } catch (error) {
    return err(error instanceof Error ? error.message : 'Falha ao carregar o RomFlow', 500)
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireSession(req)
  if (!auth.ok) return err(auth.message, auth.status)
  const user = await resolveFlowUser(auth.session)
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return err('Dados inválidos', 400)
  const area = parseArea(body.area)
  if (!canAccessArea(user, area)) return err('Sem permissão nesta área', 403)
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) return err('Informe o título', 400)
  const company = typeof body.company === 'string' ? body.company : ''
  if (!user.companyIds.includes(company)) return err('Empresa inválida nesta unidade', 400)
  try {
    const receipt = await persistStoredFile((body.receipt as StoredFile | null) ?? null, 'receipts')
    const rawDate = typeof body.max_payment_date === 'string' ? body.max_payment_date : ''
    const { defaultPaymentDate } = await import('@/lib/flow/workflow')
    const expenseType = parseExpenseType(body.expense_type)
    const expense = await createExpense(user, {
      title,
      description: typeof body.description === 'string' ? body.description : '',
      area,
      expense_type: expenseType,
      event_project: typeof body.event_project === 'string' ? body.event_project : '',
      event_date: typeof body.event_date === 'string' ? body.event_date : '',
      amount: Number(body.amount) || 0,
      category: typeof body.category === 'string' ? body.category : 'cat_outros',
      payment_method: (body.payment_method as PaymentMethod) || 'pix',
      beneficiary_name: typeof body.beneficiary_name === 'string' ? body.beneficiary_name : user.name,
      beneficiary_document: typeof body.beneficiary_document === 'string' ? body.beneficiary_document : '',
      pix_key: typeof body.pix_key === 'string' ? body.pix_key : '',
      bank_name: typeof body.bank_name === 'string' ? body.bank_name : '',
      agency: typeof body.agency === 'string' ? body.agency : '',
      account: typeof body.account === 'string' ? body.account : '',
      boleto_code: typeof body.boleto_code === 'string' ? body.boleto_code : '',
      max_payment_date: rawDate || defaultPaymentDate(expenseType),
      payment_date_justification:
        typeof body.payment_date_justification === 'string' ? body.payment_date_justification : rawDate ? '' : 'Prazo padrão da área',
      receipt_justification: typeof body.receipt_justification === 'string' ? body.receipt_justification : '',
      receipt,
      payment_proof: null,
      company,
      scheduled_date: typeof body.scheduled_date === 'string' ? body.scheduled_date : null,
    })
    await notifyIntranet({
      title: `Nova solicitação: ${expense.title}`,
      body: `${user.name} · ${expense.area}`,
      href: `/flow/${expense.id}`,
    })
    return ok({ expense }, undefined, 201)
  } catch (error) {
    return err(error instanceof Error ? error.message : 'Falha ao criar solicitação', 400)
  }
}
