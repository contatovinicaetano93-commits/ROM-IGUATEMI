import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireFinance } from '@/lib/auth'
import { isCronAuthorized } from '@/lib/cron-auth'
import { isAvecConfigured } from '@/lib/avec/client'
import { runLastDoneBackfill } from '@/lib/avec/last-done-backfill'
import { warnIfLongMaxDuration } from '@/lib/vercel-runtime'

/** Backfill 2 anos (fatias) — Fluid Compute permite até 800s. */
export const maxDuration = 800
warnIfLongMaxDuration('/api/admin/last-done-backfill', maxDuration)

async function authorize(req: NextRequest) {
  if (isCronAuthorized(req)) return { ok: true as const }
  const auth = await requireFinance(req)
  if (!auth.ok) return auth
  return { ok: true as const }
}

/**
 * POST — preenche last_done_at + client_service_visits via Avec 0002.
 * Body: {
 *   daysBack?: number (7–730, default 730),
 *   maxPages?: number,
 *   chunkDays?: number (default 30),
 *   recordVisit?: boolean (default true),
 *   maxChunks?: number,
 *   resumeFrom?: string YYYY-MM-DD
 * }
 * Não inventa visitas; só grava datas que a Avec reporta.
 * Agenda histórica = atendimentos realizados (0002), não arquivo de slots 0051.
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
          : 730
    const maxPages =
      typeof body.maxPages === 'number' && Number.isFinite(body.maxPages)
        ? body.maxPages
        : undefined
    const chunkDays =
      typeof body.chunkDays === 'number' && Number.isFinite(body.chunkDays)
        ? body.chunkDays
        : undefined
    const recordVisit =
      typeof body.recordVisit === 'boolean'
        ? body.recordVisit
        : typeof body.record_visit === 'boolean'
          ? body.record_visit
          : undefined
    const maxChunks =
      typeof body.maxChunks === 'number' && Number.isFinite(body.maxChunks)
        ? body.maxChunks
        : typeof body.max_chunks === 'number'
          ? body.max_chunks
          : undefined
    const resumeFrom =
      typeof body.resumeFrom === 'string'
        ? body.resumeFrom
        : typeof body.resume_from === 'string'
          ? body.resume_from
          : undefined

    const stats = await runLastDoneBackfill({
      daysBack,
      maxPages,
      chunkDays,
      recordVisit,
      maxChunks,
      resumeFrom,
    })
    return ok(stats)
  } catch (e) {
    return handleError(e)
  }
}
