import { NextRequest } from 'next/server'
import { err, handleError } from '@/lib/api-response'
import { authorizeAvecSync, executeAvecSync } from '@/lib/avec/sync-http'

/**
 * Sync Avec full/ops — P1/P2/P3 + TM. Pro permite até 800s.
 * Requer Vercel Fluid Compute (Settings → Functions → Fluid). Sem Fluid o teto cai ~300s.
 */
export const maxDuration = 800

/**
 * Cron fatiado do sync full — path sem query string.
 * Isola KPIs de Visão do peso de agenda/catálogo.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authorizeAvecSync(req)
    if (!auth.ok) return err(auth.message, auth.status)
    return await executeAvecSync(req, {
      defaultMode: 'full',
      forceMode: 'full',
      forceStage: 'ops',
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
