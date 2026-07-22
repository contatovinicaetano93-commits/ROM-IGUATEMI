import { ok, handleError } from '@/lib/api-response'
import { listUpcomingSchedules } from '@/lib/services'
import { compareScheduleByTimeThenName } from '@/lib/salon/sort'

// GET /api/schedule — próximos agendamentos (lembrete visual no painel).
export async function GET() {
  try {
    const items = [...(await listUpcomingSchedules(7, 50))].sort(compareScheduleByTimeThenName)
    return ok(items)
  } catch (e) {
    return handleError(e)
  }
}
