import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireAdmin } from '@/lib/auth'
import { isCronAuthorized } from '@/lib/cron-auth'
import { purgeInactiveContacts, DEFAULT_RETENTION_DAYS } from '@/lib/lgpd'

/** GET — cron semanal (CRON_SECRET) ou admin manual. Anonimiza contato inativo há 5+ anos. */
export async function GET(req: NextRequest) {
  try {
    if (!isCronAuthorized(req)) {
      const auth = await requireAdmin(req)
      if (!auth.ok) return err(auth.message, auth.status)
    }

    const days = Number(req.nextUrl.searchParams.get('days')) || DEFAULT_RETENTION_DAYS
    const result = await purgeInactiveContacts(days)
    return ok(result)
  } catch (e) {
    return handleError(e)
  }
}
