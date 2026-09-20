import { NextRequest } from 'next/server'
import { err, ok } from '@/lib/api-response'
import { toggleEmployeeStatus } from '@/lib/employees'
import { requireFlowMaster } from '@/lib/flow/require-master'

export async function POST(req: NextRequest) {
  const auth = await requireFlowMaster(req)
  if (!auth.ok) return err(auth.message, auth.status)
  const body = await req.json().catch(() => null)
  const userId = typeof body?.userId === 'string' ? body.userId : ''
  if (!userId) return err('Informe o usuário', 400)
  try {
    await toggleEmployeeStatus(auth.flowUser, userId)
    return ok({ ok: true })
  } catch (error) {
    return err(error instanceof Error ? error.message : 'Falha ao alterar o status', 400)
  }
}
