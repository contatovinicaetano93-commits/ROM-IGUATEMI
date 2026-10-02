import { NextRequest } from 'next/server'
import { z } from 'zod'
import { err, handleError, ok } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { getRomPanelId } from '@/lib/brand'
import { canAccessFolha } from '@/lib/folha/access'
import { applyZigConsumoBaruToPeriod } from '@/lib/folha/service'

const bodySchema = z.object({
  period_id: z.string().min(1),
})

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSession(req)
    if (!auth.ok) return err(auth.message, auth.status)
    if (!canAccessFolha(auth.session)) return err('Acesso restrito à Folha de pagamento', 403)

    const parsed = bodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return err(parsed.error.issues.map((i) => i.message).join(', '), 422)

    const result = await applyZigConsumoBaruToPeriod(getRomPanelId(), {
      periodId: parsed.data.period_id,
      actor: auth.session.user,
    })

    return ok({
      draft: result.draft,
      period_id: result.period.id,
      period_status: result.period.status,
      report: result.report,
      zig: result.zig,
    })
  } catch (e) {
    if (
      e instanceof Error &&
      (/não configurado|já pago|vazio|não encontrado|inválido/i.test(e.message) ||
        /Zig /i.test(e.message))
    ) {
      return err(e.message, /não configurado/i.test(e.message) ? 503 : 400)
    }
    return handleError(e)
  }
}
