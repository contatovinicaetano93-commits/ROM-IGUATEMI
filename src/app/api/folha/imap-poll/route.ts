import { NextRequest } from 'next/server'
import { err, handleError, ok } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { getRomPanelId } from '@/lib/brand'
import { isCronAuthorized } from '@/lib/cron-auth'
import { canAccessFolha } from '@/lib/folha/access'
import { pollFolhaImapInbox } from '@/lib/folha/imap-poll'

/**
 * GET — cron (CRON_SECRET) ou sessão com módulo folha.
 * Lê UNSEEN com DARF/DAS/mensalidade na caixa FOLHA_IMAP_* e aplica no Q1 (dia 20).
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
    const period = req.nextUrl.searchParams.get('period')?.trim()
    const referenceDay = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : undefined
    const periodId =
      period && /^\d{4}-\d{2}-q[12]$/.test(period) ? period : undefined
    const result = await pollFolhaImapInbox(getRomPanelId(), {
      day: referenceDay,
      periodId,
    })
    return ok(result)
  } catch (e) {
    return handleError(e)
  }
}
