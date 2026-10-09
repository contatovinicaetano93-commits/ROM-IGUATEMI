import { NextRequest } from 'next/server'
import { err, ok } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { hasPanelModule, parseGrantableModules } from '@/lib/intranet/modules'
import { isAllowedChecksDiarioPhotoUrl } from '@/lib/checks-diario/photo'
import { completeMyCheck } from '@/lib/checks-diario/service'

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

  const taskId = typeof body.task_id === 'string' ? body.task_id : ''
  if (!taskId) return err('Informe a tarefa', 400)

  const photoUrlRaw = typeof body.photo_url === 'string' ? body.photo_url : null
  if (!isAllowedChecksDiarioPhotoUrl(photoUrlRaw)) {
    return err('photo_url inválida: use upload do Checks diários (Vercel Blob)', 400)
  }
  const photoUrl = photoUrlRaw?.trim() ? photoUrlRaw.trim() : null

  try {
    const log = await completeMyCheck({
      session: auth.session,
      taskId,
      note: typeof body.note === 'string' ? body.note : null,
      photoUrl,
      photoCapturedAt:
        typeof body.photo_captured_at === 'string' ? body.photo_captured_at : null,
    })
    return ok({ log }, undefined, 201)
  } catch (error) {
    return err(error instanceof Error ? error.message : 'Falha ao lançar check', 400)
  }
}
