import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireStock } from '@/lib/auth'
import { isCronAuthorized } from '@/lib/cron-auth'
import { isAvecConfigured } from '@/lib/avec/client'
import { runStockSync, type StockSyncMode } from '@/lib/avec/sync-stock'
import { isSyncLockBusyError } from '@/lib/sync-lock'

/** Sync de estoque pode demorar (vários relatórios paginados). */
export const maxDuration = 300

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

  try {
    const run = await runStockSync(mode)
    return ok({ ...run, mode })
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
