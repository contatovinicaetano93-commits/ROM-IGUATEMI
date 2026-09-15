import { NextRequest } from 'next/server'
import { err, ok } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { resolveFlowUser } from '@/lib/flow/from-session'
import { applyExpenseAction, getExpense } from '@/lib/flow/store'
import { persistStoredFile } from '@/lib/flow/files'
import type { RequestAction } from '@/lib/flow/types'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSession(req)
  if (!auth.ok) return err(auth.message, auth.status)
  const { id } = await ctx.params
  const expense = await getExpense(id, await resolveFlowUser(auth.session))
  if (!expense) return err('Solicitação não encontrada', 404)
  return ok({ expense })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSession(req)
  if (!auth.ok) return err(auth.message, auth.status)
  const { id } = await ctx.params
  const body = await req.json().catch(() => null)
  const action = body?.action as RequestAction | undefined
  if (!action) return err('Informe a ação', 400)
  try {
    const proof = body?.proof ? await persistStoredFile(body.proof, 'proofs') : null
    const receipt = body?.receipt ? await persistStoredFile(body.receipt, 'receipts') : null
    const expense = await applyExpenseAction(await resolveFlowUser(auth.session), id, action, {
      note: typeof body?.note === 'string' ? body.note : undefined,
      proof,
      receipt,
    })
    return ok({ expense })
  } catch (error) {
    return err(error instanceof Error ? error.message : 'Falha na ação', 400)
  }
}
