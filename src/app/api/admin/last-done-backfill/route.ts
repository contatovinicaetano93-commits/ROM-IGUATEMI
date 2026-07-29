import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireFinance } from '@/lib/auth'
import { isCronAuthorized } from '@/lib/cron-auth'
import { isAvecConfigured } from '@/lib/avec/client'
import { runLastDoneBackfill } from '@/lib/avec/last-done-backfill'

/** Backfill histórico de last_done_at via 0002 — pode paginar bastante. */
export const maxDuration = 300

async function authorize(req: NextRequest) {
  if (isCronAuthorized(req)) return { ok: true as const }
  const auth = await requireFinance(req)
  if (!auth.ok) return auth
  return { ok: true as const }
}

/**
 * POST — preenche client_services.last_done_at com ultima_visita real (Avec 0002).
 * Body: { daysBack?: number (7–366, default 180), maxPages?: number }
 * Não inventa visitas; só grava datas que a Avec reporta.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authorize(req)
    if (!auth.ok) return err(auth.message, auth.status)

    if (!isAvecConfigured()) {
      return err('Avec não configurado (AVEC_API_TOKEN)', 503)
    }

    let body: Record<string, unknown> = {}
    try {
      body = (await req.json()) as Record<string, unknown>
    } catch {
      body = {}
    }

    const daysBack =
      typeof body.daysBack === 'number' && Number.isFinite(body.daysBack)
        ? body.daysBack
        : typeof body.days_back === 'number'
          ? body.days_back
          : 180
    const maxPages =
      typeof body.maxPages === 'number' && Number.isFinite(body.maxPages)
        ? body.maxPages
        : undefined

    const stats = await runLastDoneBackfill({ daysBack, maxPages })
    return ok(stats)
  } catch (e) {
    return handleError(e)
  }
}
