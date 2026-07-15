import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireStock } from '@/lib/auth'
import { listAlerts } from '@/lib/stock'

export async function GET(req: NextRequest) {
  try {
    const auth = await requireStock(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const status = req.nextUrl.searchParams.get('status')
    const alerts = await listAlerts(status === 'ativo' || status === 'reconhecido' ? status : undefined)
    return ok(alerts)
  } catch (e) {
    return handleError(e)
  }
}
