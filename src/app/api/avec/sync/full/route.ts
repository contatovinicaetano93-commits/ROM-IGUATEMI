import { NextRequest } from 'next/server'
import { err, handleError } from '@/lib/api-response'
import { authorizeAvecSync, executeAvecSync } from '@/lib/avec/sync-http'

/**
 * Sync Avec full — Pro permite até 800s.
 * Requer Vercel Fluid Compute (Settings → Functions → Fluid). Sem Fluid o teto cai ~300s.
 */
export const maxDuration = 800

/**
 * Sync full monolítico (admin / legado) — path sem query string.
 * Cron de mercado usa /full/ops|/agenda|/catalog (fatias no orçamento).
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authorizeAvecSync(req)
    if (!auth.ok) return err(auth.message, auth.status)
    return await executeAvecSync(req, {
      defaultMode: 'full',
      forceMode: 'full',
      forceStage: 'all',
      cron: auth.cron,
      force: !auth.cron,
    })
  } catch (e) {
    return handleError(e)
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
