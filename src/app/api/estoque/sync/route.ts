import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireStock } from '@/lib/auth'
import { isCronAuthorized } from '@/lib/cron-auth'
import { isAvecConfigured } from '@/lib/avec/client'
import { getLastStockSync, runStockSync, stockPaginationPlan, type StockSyncMode } from '@/lib/avec/sync-stock'
import { isSyncLockBusyError } from '@/lib/sync-lock'
import { isDbQuotaError, dbQuotaUserMessage } from '@/lib/avec/db-quota-errors'

/** Sync de estoque pode demorar (vários relatórios paginados). */
export const maxDuration = 300

const STOCK_FAST_MIN_GAP_MS = 25 * 60_000
const STOCK_FULL_MIN_GAP_MS = 20 * 60 * 60_000

function parseMode(req: NextRequest): StockSyncMode {
  return req.nextUrl.searchParams.get('mode') === 'full' ? 'full' : 'fast'
}

async function execute(req: NextRequest, cron: boolean) {
  if (!isAvecConfigured()) {
    if (cron) {
      return ok({ skipped: true, reason: 'aguardando_avec_token', mode: parseMode(req) })
    }
    return err('Avec não configurado (AVEC_API_TOKEN)', 503)
  }

  const mode = parseMode(req)
  const force = req.nextUrl.searchParams.get('force') === '1'
  const continueSync = req.nextUrl.searchParams.get('continue') === '1'
  const reportParam = req.nextUrl.searchParams.get('report')?.trim()
  const startPageParam = req.nextUrl.searchParams.get('startPage')

  // Gap só no cron — trigger manual (diagnóstico) pode forçar na hora; continue=1 também pula gap.
  if (cron && !force && !continueSync) {
    const kind = mode === 'full' ? 'stock_full' : 'stock_fast'
    const minGap = mode === 'full' ? STOCK_FULL_MIN_GAP_MS : STOCK_FAST_MIN_GAP_MS
    const last = await getLastStockSync(kind, { finishedOnly: true }).catch(() => null)
    if (last?.created_at) {
      const age = Date.now() - new Date(last.created_at).getTime()
      if (age >= 0 && age < minGap) {
        return ok({
          skipped: true,
          reason: 'sync_recente',
          mode,
          last,
          note: `Último estoque ${mode} há ${Math.round(age / 60_000)} min — janela ${Math.round(minGap / 60_000)} min`,
        })
      }
    }
  }

  try {
    if (continueSync) {
      const continueFrom =
        reportParam && startPageParam
          ? { [reportParam]: Number(startPageParam) }
          : 'auto'
      const run = await runStockSync('full', { continueFrom })
      return ok({
        ...run,
        mode: 'full',
        continued: true,
        pagination: stockPaginationPlan(run),
      })
    }
    const run = await runStockSync(mode)
    return ok({ ...run, mode, pagination: stockPaginationPlan(run) })
  } catch (e) {
    if (isSyncLockBusyError(e)) {
      if (cron) {
        return ok({
          skipped: true,
          reason: 'sync_em_andamento',
          mode,
          holder: e.holder,
          expires_at: e.expiresAt,
        })
      }
      return err(e.message, 429)
    }
    if (isDbQuotaError(e)) {
      if (cron) {
        return ok({
          skipped: true,
          reason: 'db_quota',
          mode,
          note: dbQuotaUserMessage(e),
        })
      }
      return err(dbQuotaUserMessage(e), 503)
    }
    throw e
  }
}

/** Vercel Cron dispara via GET com Authorization: Bearer CRON_SECRET (mesmo padrão de /api/avec/sync). */
export async function GET(req: NextRequest) {
  try {
    if (!isCronAuthorized(req)) return err('Não autorizado', 401)
    return await execute(req, true)
  } catch (e) {
    return handleError(e)
  }
}

/** Trigger manual — admin, financeiro (acesso duplo) ou estoque, direto da própria área de diagnóstico. */
export async function POST(req: NextRequest) {
  try {
    const cron = isCronAuthorized(req)
    if (!cron) {
      const auth = await requireStock(req)
      if (!auth.ok) return err(auth.message, auth.status)
    }
    return await execute(req, cron)
  } catch (e) {
    return handleError(e)
  }
}
