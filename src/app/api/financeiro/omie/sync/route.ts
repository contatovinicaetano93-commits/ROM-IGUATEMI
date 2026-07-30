import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireFinance } from '@/lib/auth'
import { isCronAuthorized } from '@/lib/cron-auth'
import { normalizeMonthKey } from '@/lib/finance'
import { isOmieConfigured, isOmieMock } from '@/lib/omie/client'
import { syncOmieExpensesForMonth, syncOmieExpensesRecent } from '@/lib/omie/sync'
import { todayIso } from '@/lib/salon/format'
import { isSyncLockBusyError } from '@/lib/sync-lock'

export const maxDuration = 300

async function execute(opts: { cron: boolean; monthParam: string | null }) {
  if (!isOmieConfigured() && !isOmieMock()) {
    if (opts.cron) {
      return ok({ skipped: true, reason: 'aguardando_omie_credentials' })
    }
    return err(
      'Omie não configurado (OMIE_SERVICOS_APP_KEY/SECRET e OMIE_COMERCIO_APP_KEY/SECRET)',
      503,
    )
  }

  try {
    if (opts.monthParam) {
      const month = normalizeMonthKey(opts.monthParam)
      if (!month) return err('Parâmetro month inválido (esperado YYYY-MM)', 422)
      const run = await syncOmieExpensesForMonth(month)
      return ok(run)
    }

    if (opts.cron) {
      const result = await syncOmieExpensesRecent()
      return ok(result)
    }

    const run = await syncOmieExpensesForMonth(todayIso().slice(0, 7))
    return ok(run)
  } catch (e) {
    if (isSyncLockBusyError(e)) {
      return ok({
        skipped: true,
        reason: 'sync_em_andamento',
        holder: e.holder,
        expires_at: e.expiresAt,
        note: 'Outro sync Omie já está em execução (lock distribuído)',
      })
    }
    throw e
  }
}

/** Vercel Cron — Authorization: Bearer CRON_SECRET. Sync mês atual + anterior. */
export async function GET(req: NextRequest) {
  try {
    if (!isCronAuthorized(req)) return err('Não autorizado', 401)
    return await execute({
      cron: true,
      monthParam: req.nextUrl.searchParams.get('month'),
    })
  } catch (e) {
    return handleError(e)
  }
}

/** Trigger manual — admin / financeiro. Body/query: { month?: "YYYY-MM" }. */
export async function POST(req: NextRequest) {
  try {
    const cron = isCronAuthorized(req)
    if (!cron) {
      const auth = await requireFinance(req)
      if (!auth.ok) return err(auth.message, auth.status)
    }

    const queryMonth = req.nextUrl.searchParams.get('month')
    const body = (await req.json().catch(() => ({}))) as { month?: string }
    return await execute({
      cron,
      monthParam: queryMonth ?? body.month ?? null,
    })
  } catch (e) {
    return handleError(e)
  }
}
