import { NextRequest } from 'next/server'
import { err } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { blobProxyResponse } from '@/lib/blob/private'
import { isAllowedChecksDiarioPhotoUrl } from '@/lib/checks-diario/photo'
import { getChecksLogById } from '@/lib/checks-diario/store'
import { hasPanelModule, parseGrantableModules } from '@/lib/intranet/modules'

type Ctx = { params: Promise<{ id: string }> }

function canUseChecks(session: { role: string; modules?: unknown }): boolean {
  const role = session.role as 'admin' | 'staff' | 'financeiro' | 'estoque' | 'mkt'
  return hasPanelModule(role, parseGrantableModules(session.modules), 'checks_diario')
}

/** Download autenticado da foto do check (blob privado ou legado público). */
export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await requireSession(req)
  if (!auth.ok) return err(auth.message, auth.status)
  if (!canUseChecks(auth.session)) return err('Acesso restrito a Checks diários', 403)

  const { id } = await ctx.params
  if (!id) return err('Id inválido', 400)

  try {
    const log = await getChecksLogById(id)
    if (!log?.photo_url) return err('Foto não encontrada', 404)
    if (!isAllowedChecksDiarioPhotoUrl(log.photo_url)) {
      return err('URL da foto inválida', 400)
    }
    return blobProxyResponse(log.photo_url)
  } catch (error) {
    console.error('[checks-diario/photo]', error instanceof Error ? error.message : error)
    return err(error instanceof Error ? error.message : 'Falha ao abrir foto', 500)
  }
}
