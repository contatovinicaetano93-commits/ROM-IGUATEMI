import { NextRequest } from 'next/server'
import { err, handleError } from '@/lib/api-response'
import { authorizeAvecSync, executeAvecSync } from '@/lib/avec/sync-http'
import { warnIfLongMaxDuration } from '@/lib/vercel-runtime'

/** Sync Avec full — Pro + Fluid Compute até 800s; sem Fluid, cap 300s na Vercel. */
export const maxDuration = 800
warnIfLongMaxDuration('/api/avec/sync/full', maxDuration)

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
