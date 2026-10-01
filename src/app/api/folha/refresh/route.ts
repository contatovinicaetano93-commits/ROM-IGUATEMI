import { NextRequest } from 'next/server'
import { err, handleError, ok } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { getRomPanelId } from '@/lib/brand'
import { canAccessFolha } from '@/lib/folha/access'
import { refreshFolhaDraft } from '@/lib/folha/service'

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSession(req)
    if (!auth.ok) return err(auth.message, auth.status)
    if (!canAccessFolha(auth.session)) return err('Acesso restrito à Folha de pagamento', 403)

    const body = (await req.json().catch(() => ({}))) as { day?: string }
    const day = body.day?.trim()
    const referenceDay = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : undefined

    const { draft, period } = await refreshFolhaDraft(getRomPanelId(), {
      referenceDay,
      actor: auth.session.user,
    })

    return ok({ draft, period_id: period.id, period_status: period.status })
  } catch (e) {
    if (e instanceof Error && /Sem snapshot 8123/i.test(e.message)) {
      return err(e.message, 404)
    }
    return handleError(e)
  }
}
