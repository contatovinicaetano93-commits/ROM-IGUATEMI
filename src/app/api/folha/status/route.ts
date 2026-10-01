import { NextRequest } from 'next/server'
import { z } from 'zod'
import { err, handleError, ok } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { getRomPanelId } from '@/lib/brand'
import { canAccessFolha } from '@/lib/folha/access'
import { transitionFolhaPeriod } from '@/lib/folha/service'

const bodySchema = z.object({
  period_id: z.string().min(1),
  status: z.enum(['draft', 'ready_for_review', 'approved', 'paid']),
})

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSession(req)
    if (!auth.ok) return err(auth.message, auth.status)
    if (!canAccessFolha(auth.session)) return err('Acesso restrito à Folha de pagamento', 403)

    const parsed = bodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return err(parsed.error.issues.map((i) => i.message).join(', '), 422)

    const { draft, period } = await transitionFolhaPeriod({
      panel: getRomPanelId(),
      periodId: parsed.data.period_id,
      status: parsed.data.status,
      actor: auth.session.user,
    })

    return ok({ draft, period_id: period.id, period_status: period.status })
  } catch (e) {
    if (e instanceof Error && /Transição inválida|não encontrado|vazio/i.test(e.message)) {
      return err(e.message, 400)
    }
    return handleError(e)
  }
}
