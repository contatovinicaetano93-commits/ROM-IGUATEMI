import { NextRequest } from 'next/server'
import { err, handleError } from '@/lib/api-response'
import { authorizeAvecSync, executeAvecSync } from '@/lib/avec/sync-http'

/** Sync Avec full — Pro permite até 800s. */
export const maxDuration = 800

/**
 * Cron dedicado do sync full — path sem query string.
 * Vercel Cron às vezes entrega `/api/avec/sync?mode=full` sem `mode`,
 * e o GET caía em fast (default). Esta rota força full.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authorizeAvecSync(req)
    if (!auth.ok) return err(auth.message, auth.status)
    return await executeAvecSync(req, {
      defaultMode: 'full',
      forceMode: 'full',
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
