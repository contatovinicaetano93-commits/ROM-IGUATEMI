import { NextRequest } from 'next/server'
import { err, ok } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { canUseCurriculos } from '@/lib/curriculos/access'
import { updateCurriculoStatus } from '@/lib/curriculos/store'
import { isCurriculoStatus } from '@/lib/curriculos/types'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireSession(req)
  if (!auth.ok) return err(auth.message, auth.status)
  if (!canUseCurriculos(auth.session)) return err('Acesso restrito a Currículos', 403)

  const { id } = await ctx.params
  if (!id) return err('Id inválido', 400)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return err('Dados inválidos', 400)
  if (!isCurriculoStatus(body.status)) {
    return err('Status inválido', 400)
  }

  try {
    const curriculo = await updateCurriculoStatus(id, body.status)
    if (!curriculo) return err('Currículo não encontrado', 404)
    return ok({ curriculo })
  } catch (error) {
    return err(error instanceof Error ? error.message : 'Falha ao atualizar', 500)
  }
}
