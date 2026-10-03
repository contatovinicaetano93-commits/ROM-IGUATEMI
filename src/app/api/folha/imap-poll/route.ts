import { NextRequest } from 'next/server'
import { err, handleError, ok } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { getRomPanelId } from '@/lib/brand'
import { isCronAuthorized } from '@/lib/cron-auth'
import { canAccessFolha } from '@/lib/folha/access'
import { readFolhaImapConfig } from '@/lib/folha/imap-client'
import { decideFolhaImapCronRun } from '@/lib/folha/imap-cron-window'
import { pollFolhaImapInbox } from '@/lib/folha/imap-poll'
import { todayIsoSaoPaulo } from '@/lib/folha/period'

/**
 * GET — cron (CRON_SECRET) ou sessão com módulo folha.
 * Lê UNSEEN com DARF/DAS/mensalidade na caixa FOLHA_IMAP_* e aplica no Q1 (dia 20).
 *
 * Cron Vercel dispara a cada 10 min; IMAP só abre 1×/dia (12:00 UTC BR / 12:10 UTC IG)
 * ou a cada 10 min nos 5 dias até o pagamento Q1 (20) e Q2 (05).
 * `?force=1` (cron) ou clique no painel ignoram a cadência.
 */
export async function GET(req: NextRequest) {
  try {
    const cron = isCronAuthorized(req)
    if (!cron) {
      const auth = await requireSession(req)
      if (!auth.ok) return err(auth.message, auth.status)
      if (!canAccessFolha(auth.session)) {
        return err('Acesso restrito à Folha de pagamento', 403)
      }
    }

    const day = req.nextUrl.searchParams.get('day')?.trim()
    const period = req.nextUrl.searchParams.get('period')?.trim()
    const force = req.nextUrl.searchParams.get('force')?.trim() === '1'
    const referenceDay = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : undefined
    const periodId =
      period && /^\d{4}-\d{2}-q[12]$/.test(period) ? period : undefined
    const panel = getRomPanelId()
    const decision = decideFolhaImapCronRun({
      today: todayIsoSaoPaulo(),
      now: new Date(),
      panel,
      force: !cron || force,
    })
    const cadenceMeta = {
      cadence: decision.cadence,
      cron_trigger: decision.trigger,
      pay_date: decision.payDate,
      window_from: decision.windowFrom,
      window_to: decision.windowTo,
    }
    if (!decision.shouldPoll) {
      return ok({
        configured: Boolean(readFolhaImapConfig()),
        skipped: 'awaiting_daily_slot',
        fetched: 0,
        ingested: 0,
        applied: 0,
        marked_seen: 0,
        errors: [],
        period_id: decision.periodId,
        ...cadenceMeta,
      })
    }

    const result = await pollFolhaImapInbox(panel, {
      day: referenceDay,
      periodId,
    })
    return ok({ ...result, ...cadenceMeta })
  } catch (e) {
    return handleError(e)
  }
}
