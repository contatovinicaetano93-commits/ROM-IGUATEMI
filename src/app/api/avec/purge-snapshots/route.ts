import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireAdmin } from '@/lib/auth'
import { isCronAuthorized } from '@/lib/cron-auth'
import { purgeAvecStorageBloat } from '@/lib/avec/snapshots'
import { isDbQuotaError, dbQuotaUserMessage } from '@/lib/avec/db-quota-errors'

/** Purge pode varrer muitas linhas de snapshot legado. */
export const maxDuration = 300

/** GET — cron diário ou admin: libera espaço no Postgres (snapshots/sync runs). */
export async function GET(req: NextRequest) {
  try {
    if (!isCronAuthorized(req)) {
      const auth = await requireAdmin(req)
      if (!auth.ok) return err(auth.message, auth.status)
    }

    const keepSnapshotDays = Number(req.nextUrl.searchParams.get('keep_snapshot_days') ?? 0)
    const keepSyncRunDays = Number(req.nextUrl.searchParams.get('keep_sync_run_days') ?? 2)
    const result = await purgeAvecStorageBloat({
      keepSnapshotDays: Number.isFinite(keepSnapshotDays) ? keepSnapshotDays : 0,
      keepSyncRunDays: Number.isFinite(keepSyncRunDays) ? keepSyncRunDays : 2,
    })
    return ok(result)
  } catch (e) {
    if (isDbQuotaError(e)) {
      return err(dbQuotaUserMessage(e), 503)
    }
    return handleError(e)
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
