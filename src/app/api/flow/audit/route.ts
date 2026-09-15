import { NextRequest } from 'next/server'
import { err, ok } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { AuditLogger } from '@/lib/audit'
import { resolveFlowUser } from '@/lib/flow/from-session'
import { canManageUsers } from '@/lib/flow/workflow'

export async function GET(req: NextRequest) {
  const auth = await requireSession(req)
  if (!auth.ok) return err(auth.message, auth.status)
  const user = await resolveFlowUser(auth.session)
  if (!canManageUsers(user.role)) return err('Sem permissão para auditoria do Rom Flow', 403)
  const logs = await AuditLogger.listByResourcePrefix('flow:')
  return ok({ logs })
}
