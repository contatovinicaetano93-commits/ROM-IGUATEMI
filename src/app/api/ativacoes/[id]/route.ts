import { NextRequest } from 'next/server'
import { err, ok } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { hasPanelModule, parseGrantableModules } from '@/lib/intranet/modules'
import { cancelBrandActivation, getBrandActivationById } from '@/lib/ativacoes/store'
import { notifyAtivacoesEvent } from '@/lib/ativacoes/notify'

function canUseAtivacoes(session: { role: string; modules?: unknown }): boolean {
  const role = session.role as 'admin' | 'staff' | 'financeiro' | 'estoque' | 'mkt'
  return hasPanelModule(role, parseGrantableModules(session.modules), 'ativacoes')
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireSession(req)
  if (!auth.ok) return err(auth.message, auth.status)
  if (!canUseAtivacoes(auth.session)) return err('Acesso restrito a Ativações', 403)

  const { id } = await ctx.params
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return err('Id inválido', 400)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return err('Dados inválidos', 400)
  if (body.status !== 'cancelled') {
    return err('Só é possível cancelar (status: cancelled)', 400)
  }

  const actorName = auth.session.displayName || auth.session.user
  try {
    const before = await getBrandActivationById(id)
    if (!before) return err('Ativação não encontrada', 404)
    if (before.status === 'cancelled') return ok({ activation: before })

    const activation = await cancelBrandActivation(id, actorName)
    if (!activation) return err('Ativação não encontrada ou já cancelada', 404)

    void notifyAtivacoesEvent({ kind: 'cancelled', activation, actorName }).catch(() => {})
    return ok({ activation })
  } catch (error) {
    return err(error instanceof Error ? error.message : 'Falha ao cancelar ativação', 500)
  }
}
