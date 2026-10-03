import { NextRequest } from 'next/server'
import { err, ok } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { hasPanelModule, parseGrantableModules } from '@/lib/intranet/modules'
import {
  createTaskForEmployee,
  patchTaskForEmployee,
} from '@/lib/checks-diario/service'

function canUseChecks(session: { role: string; modules?: unknown }): boolean {
  const role = session.role as 'admin' | 'staff' | 'financeiro' | 'estoque' | 'mkt'
  return hasPanelModule(role, parseGrantableModules(session.modules), 'checks_diario')
}

export async function POST(req: NextRequest) {
  const auth = await requireSession(req)
  if (!auth.ok) return err(auth.message, auth.status)
  if (!canUseChecks(auth.session)) return err('Acesso restrito a Checks diários', 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return err('Dados inválidos', 400)

  const employeeId = typeof body.employee_id === 'string' ? body.employee_id : ''
  const title = typeof body.title === 'string' ? body.title : ''
  if (!employeeId || !title.trim()) return err('Informe colaborador e título', 400)

  try {
    const task = await createTaskForEmployee({
      session: auth.session,
      employeeId,
      title,
      description: typeof body.description === 'string' ? body.description : null,
      sortOrder: typeof body.sort_order === 'number' ? body.sort_order : undefined,
      requiresPhoto: body.requires_photo === true,
    })
    return ok({ task }, undefined, 201)
  } catch (error) {
    return err(error instanceof Error ? error.message : 'Falha ao criar tarefa', 400)
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireSession(req)
  if (!auth.ok) return err(auth.message, auth.status)
  if (!canUseChecks(auth.session)) return err('Acesso restrito a Checks diários', 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return err('Dados inválidos', 400)

  const taskId = typeof body.task_id === 'string' ? body.task_id : ''
  if (!taskId) return err('Informe a tarefa', 400)

  try {
    const task = await patchTaskForEmployee({
      session: auth.session,
      taskId,
      title: typeof body.title === 'string' ? body.title : undefined,
      description:
        body.description === null
          ? null
          : typeof body.description === 'string'
            ? body.description
            : undefined,
      sortOrder: typeof body.sort_order === 'number' ? body.sort_order : undefined,
      requiresPhoto:
        typeof body.requires_photo === 'boolean' ? body.requires_photo : undefined,
      active: typeof body.active === 'boolean' ? body.active : undefined,
    })
    return ok({ task })
  } catch (error) {
    return err(error instanceof Error ? error.message : 'Falha ao atualizar tarefa', 400)
  }
}
