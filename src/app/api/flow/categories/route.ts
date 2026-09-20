import { NextRequest } from 'next/server'
import { err, ok } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { resolveFlowUser } from '@/lib/flow/from-session'
import { createFlowCategory, listFlowCategories, updateFlowCategory } from '@/lib/flow/store'
import { canManageUsers } from '@/lib/flow/workflow'

export async function GET(req: NextRequest) {
  const auth = await requireSession(req)
  if (!auth.ok) return err(auth.message, auth.status)
  return ok({ categories: await listFlowCategories() })
}

export async function POST(req: NextRequest) {
  const auth = await requireSession(req)
  if (!auth.ok) return err(auth.message, auth.status)
  const user = await resolveFlowUser(auth.session)
  if (!canManageUsers(user.role)) return err('Sem permissão para categorias', 403)
  const body = await req.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name : ''
  const color = typeof body?.color === 'string' ? body.color : '#b08b57'
  try {
    const category = await createFlowCategory(name, color)
    return ok({ category }, undefined, 201)
  } catch (error) {
    return err(error instanceof Error ? error.message : 'Falha ao criar categoria', 400)
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireSession(req)
  if (!auth.ok) return err(auth.message, auth.status)
  const user = await resolveFlowUser(auth.session)
  if (!canManageUsers(user.role)) return err('Sem permissão para categorias', 403)
  const body = await req.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return err('Informe a categoria', 400)
  try {
    await updateFlowCategory(id, {
      is_active: typeof body?.is_active === 'boolean' ? body.is_active : undefined,
      name: typeof body?.name === 'string' ? body.name : undefined,
      color: typeof body?.color === 'string' ? body.color : undefined,
    })
    return ok({ ok: true })
  } catch (error) {
    return err(error instanceof Error ? error.message : 'Falha ao atualizar categoria', 400)
  }
}
