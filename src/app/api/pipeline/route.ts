import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { cachedFetch } from '@/lib/cache'
import { listTodayPipeline } from '@/lib/services'
import { countDistinctContactIds } from '@/lib/salon/headcount'
import { todayIso } from '@/lib/salon/format'

export const maxDuration = 20

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const dayParam = req.nextUrl.searchParams.get('day')
    const day = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : todayIso()
    const payload = await cachedFetch(
      `pipeline:v3:${day}`,
      async () => {
        const { scheduled, walkIn, completed } = await listTodayPipeline(day)
        const scheduledHeads = countDistinctContactIds(scheduled)
        const walkInHeads = countDistinctContactIds(walkIn)
        const completedHeads = countDistinctContactIds(completed)
        // Total do dia = união de cabeças (não soma das colunas — mesma pessoa em 2 colunas conta 1).
        const totalHeads = countDistinctContactIds([...scheduled, ...walkIn, ...completed])
        return {
          day,
          scheduled,
          walkIn,
          completed,
          counts: {
            scheduled: scheduledHeads,
            walkIn: walkInHeads,
            completed: completedHeads,
            total: totalHeads,
            /** Linhas de serviço (cards) — referência ops, não badge. */
            scheduled_services: scheduled.length,
            walkIn_services: walkIn.length,
            completed_services: completed.length,
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
