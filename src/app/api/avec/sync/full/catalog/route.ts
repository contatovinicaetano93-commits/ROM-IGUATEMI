import { NextRequest } from 'next/server'
import { err, handleError } from '@/lib/api-response'
import { authorizeAvecSync, executeAvecSync } from '@/lib/avec/sync-http'

/** Sync Avec full/catalog — dump 0004 + purge leve. Pro permite até 800s. */
export const maxDuration = 800

/**
 * Cron fatiado do sync full — path sem query string.
 * Catálogo pesado fora do caminho crítico de KPIs/agenda.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authorizeAvecSync(req)
    if (!auth.ok) return err(auth.message, auth.status)
    return await executeAvecSync(req, {
      defaultMode: 'full',
      forceMode: 'full',
      forceStage: 'catalog',
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
