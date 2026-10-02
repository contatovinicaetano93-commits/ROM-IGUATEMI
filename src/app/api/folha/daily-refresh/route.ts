import { NextRequest } from 'next/server'
import { err, handleError, ok } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { getRomPanelId } from '@/lib/brand'
import { isCronAuthorized } from '@/lib/cron-auth'
import { canAccessFolha } from '@/lib/folha/access'
import { runFolhaDailyRefresh } from '@/lib/folha/service'

/**
 * GET — cron diário (CRON_SECRET) ou sessão com módulo folha.
 * Recalcula rascunhos abertos a partir do 8123 / Avec da quinzena.
 */
export async function GET(req: NextRequest) {
  try {
    if (!isCronAuthorized(req)) {
      const auth = await requireSession(req)
      if (!auth.ok) return err(auth.message, auth.status)
      if (!canAccessFolha(auth.session)) {
        return err('Acesso restrito à Folha de pagamento', 403)
      }
    }

    const day = req.nextUrl.searchParams.get('day')?.trim()
    const today = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : undefined
    const result = await runFolhaDailyRefresh(getRomPanelId(), { today })
    const hasError = result.results.some((r) => r.outcome === 'error')
    return ok(result, null, hasError ? 207 : 200)
  } catch (e) {
    return handleError(e)
  }
}
