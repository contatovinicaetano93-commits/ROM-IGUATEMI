import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { listUpcomingSchedules } from '@/lib/services'
import { compareScheduleByTimeThenName } from '@/lib/salon/sort'
import {
  filterByProfessionalName,
  resolveSessionProfessionalScope,
} from '@/lib/intranet/professional-scope'

// GET /api/schedule — próximos agendamentos (lembrete visual no painel).
export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const proScope = await resolveSessionProfessionalScope(auth.session)
    let items = [...(await listUpcomingSchedules(7, 50))].sort(compareScheduleByTimeThenName)
    if (proScope) {
      items = filterByProfessionalName(items, proScope)
    }
    return ok(items)
  } catch (e) {
    return handleError(e)
  }
}
