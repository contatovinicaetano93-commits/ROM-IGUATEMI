import { NextRequest } from 'next/server'
import { err, ok } from '@/lib/api-response'
import { requireAdmin } from '@/lib/auth'
import { deleteEmployee, updateEmployeeModules } from '@/lib/employees'
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
      body.professional_name === undefined
        ? undefined
        : typeof body.professional_name === 'string'
          ? body.professional_name
          : null,
      body.avec_pro_id === undefined
        ? undefined
        : typeof body.avec_pro_id === 'string'
          ? body.avec_pro_id
          : null,
    )
    return ok({ employee })
  } catch (error) {
    return err(error instanceof Error ? error.message : 'Falha ao atualizar sistemas', 400)
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return err(auth.message, auth.status)
  const { id } = await context.params
  try {
    await deleteEmployee(auth.session.user, auth.session.role, id)
    return ok({ deleted: true })
  } catch (error) {
    return err(error instanceof Error ? error.message : 'Falha ao excluir colaborador', 400)
  }
}
