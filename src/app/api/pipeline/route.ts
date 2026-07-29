import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { cachedFetch } from '@/lib/cache'
import { listTodayPipeline } from '@/lib/services'
import { todayIso } from '@/lib/salon/format'

export const maxDuration = 20

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const dayParam = req.nextUrl.searchParams.get('day')
    const day = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : todayIso()
    const payload = await cachedFetch(
      `pipeline:v1:${day}`,
      async () => {
        const { scheduled, completed } = await listTodayPipeline(day)
        return {
          day,
          scheduled,
          completed,
          counts: {
            scheduled: scheduled.length,
            completed: completed.length,
            total: scheduled.length + completed.length,
          },
        }
      },
      30,
    )

    return ok(payload)
  } catch (e) {
    return handleError(e)
  }
}
