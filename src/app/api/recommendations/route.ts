import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { listActionItems } from '@/lib/salon/recommendations'
import {
  filterByOwnedContactIds,
  listContactIdsOwnedByProfessional,
  resolveSessionProfessionalScope,
} from '@/lib/intranet/professional-scope'

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const proScope = await resolveSessionProfessionalScope(auth.session)
    let items = await listActionItems({ limit: 80 })
    if (proScope) {
      const ownedIds = await listContactIdsOwnedByProfessional(proScope)
      items = filterByOwnedContactIds(items, ownedIds)
    }
    return ok(items)
  } catch (e) {
    return handleError(e)
  }
}
