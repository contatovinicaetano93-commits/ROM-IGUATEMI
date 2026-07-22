import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { listTodayPipeline } from '@/lib/services'
import { todayIso } from '@/lib/salon/format'

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const dayParam = req.nextUrl.searchParams.get('day')
    const day = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : todayIso()
    const { scheduled, completed } = await listTodayPipeline(day)

    return ok({
      day,
      scheduled,
      completed,
      counts: {
        scheduled: scheduled.length,
        completed: completed.length,
        total: scheduled.length + completed.length,
      },
    })
  } catch (e) {
    return handleError(e)
  }
}
