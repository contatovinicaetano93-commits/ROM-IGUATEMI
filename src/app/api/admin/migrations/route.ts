import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireAdmin } from '@/lib/auth'
import { isCronAuthorized } from '@/lib/cron-auth'
import { getMigrationStatus, runPendingMigrations } from '@/lib/migrations'
import { MissingMigrationFileError } from '@/lib/schema-migrations/registry'

async function authorize(req: NextRequest) {
  if (isCronAuthorized(req)) return { ok: true as const }
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth
  return { ok: true as const }
}

/** GET — status das migrations (admin ou cron). */
export async function GET(req: NextRequest) {
  try {
    const auth = await authorize(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const status = await getMigrationStatus()
    return ok(status)
  } catch (e) {
    if (e instanceof MissingMigrationFileError) {
      return err(e.message, 500)
    }
    return handleError(e)
  }
}

/** POST — aplica migrations pendentes (admin ou cron). */
export async function POST(req: NextRequest) {
  try {
    const auth = await authorize(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const summary = await runPendingMigrations()
    if (summary.lockBusy) {
      return err(summary.failed?.error ?? 'Migration em andamento', 409)
    }
    if (summary.failed) {
      return err(
        `Migration falhou: ${summary.failed.id} — ${summary.failed.error ?? 'erro'}`,
        500,
      )
    }
    return ok(summary)
  } catch (e) {
    if (e instanceof MissingMigrationFileError) {
      return err(e.message, 500)
    }
    return handleError(e)
  }
}
