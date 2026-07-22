import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { isCronAuthorized } from '@/lib/cron-auth'
import { requireSession } from '@/lib/auth'
import { processDueAftercare } from '@/lib/whatsapp/aftercare'

export async function GET(req: NextRequest) {
  try {
    if (!isCronAuthorized(req)) {
      const auth = await requireSession(req)
      if (!auth.ok || auth.session.role !== 'admin') {
        return err('Não autorizado', 401)
      }
    }

    const limitRaw = Number(req.nextUrl.searchParams.get('limit') ?? 40)
    const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, Math.round(limitRaw))) : 40
    const result = await processDueAftercare(limit)
    return ok(result)
  } catch (e) {
    return handleError(e)
  }
}
