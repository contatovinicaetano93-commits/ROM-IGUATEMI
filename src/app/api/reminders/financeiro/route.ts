import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireAdmin } from '@/lib/auth'
import { isCronAuthorized } from '@/lib/cron-auth'
import { sendFinanceReminder } from '@/lib/whatsapp/reminders'

/** GET — cron semanal (CRON_SECRET) ou admin manual. Lembrete WhatsApp de lançamento de despesas. */
export async function GET(req: NextRequest) {
  try {
    if (!isCronAuthorized(req)) {
      const auth = await requireAdmin(req)
      if (!auth.ok) return err(auth.message, auth.status)
    }
    const result = await sendFinanceReminder()
    return ok(result)
  } catch (e) {
    return handleError(e)
  }
}
