import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, err, handleError } from '@/lib/api-response'
import { requireFinance } from '@/lib/auth'
import { listExpenses, createExpense } from '@/lib/finance'
import { todayIso } from '@/lib/salon/format'

function monthRangeFromKey(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y!, m!, 0)).getUTCDate()
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}` }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireFinance(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const month = req.nextUrl.searchParams.get('month') ?? todayIso().slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(month)) return err('Parâmetro month inválido (esperado YYYY-MM)', 422)

    const { from, to } = monthRangeFromKey(month)
    const expenses = await listExpenses(from, to)
    return ok({ month, expenses })
  } catch (e) {
    return handleError(e)
  }
}

const createSchema = z.object({
  categoryId: z.string().uuid().nullable(),
  description: z.string().min(1),
  amount: z.number().positive(),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().nullable().optional(),
  receiptUrl: z.string().nullable().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const auth = await requireFinance(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const body = createSchema.parse(await req.json())
    const expense = await createExpense({ ...body, createdBy: auth.session.user })
    return ok(expense, undefined, 201)
  } catch (e) {
    return handleError(e)
  }
}
