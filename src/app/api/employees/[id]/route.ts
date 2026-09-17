import { NextRequest } from 'next/server'
import { err, ok } from '@/lib/api-response'
import { requireAdmin } from '@/lib/auth'
import { updateEmployeeModules } from '@/lib/employees'
import { parseGrantableModules } from '@/lib/intranet/modules'

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return err(auth.message, auth.status)
  const { id } = await context.params
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return err('Dados inválidos', 400)
  try {
    const employee = await updateEmployeeModules(
      auth.session.user,
      auth.session.role,
      id,
      parseGrantableModules(body.modules),
    )
    return ok({ employee })
  } catch (error) {
    return err(error instanceof Error ? error.message : 'Falha ao atualizar sistemas', 400)
  }
}
