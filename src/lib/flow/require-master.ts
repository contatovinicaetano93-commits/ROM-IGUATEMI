import { NextRequest } from 'next/server'
import { requireSession } from '@/lib/auth'
import { resolveFlowUser } from '@/lib/flow/from-session'
import { canManageUsers } from '@/lib/flow/workflow'

export async function requireFlowMaster(req: NextRequest) {
  const auth = await requireSession(req)
  if (!auth.ok) return auth
  const flowUser = await resolveFlowUser(auth.session)
  if (!canManageUsers(flowUser.role)) {
    return { ok: false as const, status: 403 as const, message: 'Apenas o master gerencia acessos do Rom Flow' }
  }
  return { ok: true as const, session: auth.session, flowUser }
}
