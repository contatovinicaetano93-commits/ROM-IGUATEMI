import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { isAvecConfigured } from '@/lib/avec/client'
import {
  isIsoDay,
  runAvecRevenueBackfill,
  yearStartIso,
} from '@/lib/avec/sync'
import { requireFinance } from '@/lib/auth'
import { isCronAuthorized } from '@/lib/cron-auth'
import { todayIso } from '@/lib/salon/format'

/** Backfill dia a dia — chunks longos podem aproximar o teto. */
export const maxDuration = 300

async function authorize(req: NextRequest) {
  if (isCronAuthorized(req)) return { ok: true as const }
  const auth = await requireFinance(req)
  if (!auth.ok) return auth
  return { ok: true as const }
}

/**
 * POST /api/avec/sync/revenue-backfill?from=2026-01-01&to=2026-07-27&chunk_days=14
 *
 * Puxa receita/atendidos (0088) + cancelamentos + no-shows para o intervalo,
 * em pedaços (chunk_days) para caber no timeout. Resposta traz next_from até done.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authorize(req)
    if (!auth.ok) return err(auth.message, auth.status)
    if (!isAvecConfigured()) return err('Avec não configurado (AVEC_API_TOKEN)', 503)

    const sp = req.nextUrl.searchParams
    const to = sp.get('to')?.trim() || todayIso()
    const from = sp.get('from')?.trim() || yearStartIso(to)
    const chunkRaw = sp.get('chunk_days')
    const chunkDays = chunkRaw ? Number(chunkRaw) : 14

    if (!isIsoDay(from) || !isIsoDay(to)) {
      return err('from/to devem ser YYYY-MM-DD', 400)
    }
    if (from > to) return err('from não pode ser depois de to', 400)
    if (!Number.isFinite(chunkDays) || chunkDays < 1) {
      return err('chunk_days inválido', 400)
    }

    const result = await runAvecRevenueBackfill({ from, to, chunkDays })
    return ok({
      ...result,
      note: result.done
        ? 'Backfill do intervalo concluído'
        : `Chunk ok — continue com from=${result.next_from}`,
    })
  } catch (e) {
    return handleError(e)
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authorize(req)
    if (!auth.ok) return err(auth.message, auth.status)
    const to = todayIso()
    return ok({
      configured: isAvecConfigured(),
      default_from: yearStartIso(to),
      default_to: to,
      default_chunk_days: 14,
      usage:
        'POST /api/avec/sync/revenue-backfill?from=2026-01-01&to=2026-07-27&chunk_days=14 — repetir com next_from até done',
    })
  } catch (e) {
    return handleError(e)
  }
}
