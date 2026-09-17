import { NextRequest } from 'next/server'
import { err, ok } from '@/lib/api-response'
import { requireAdmin } from '@/lib/auth'
import { AuditLogger } from '@/lib/audit'
import { intranetAuditHref, intranetAuditLabel } from '@/lib/intranet/audit-label'

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return err(auth.message, auth.status)
  try {
    const logs = await AuditLogger.listRecent(80)
    return ok({
      logs: logs.map((item) => ({
        id: item.id,
        username: item.username,
        role: item.role,
        action: item.action,
        resource: item.resource,
        label: intranetAuditLabel(item.action, item.resource),
        href: intranetAuditHref(item.resource),
        status: item.status,
        created_at: item.created_at,
      })),
    })
  } catch (error) {
    return err(error instanceof Error ? error.message : 'Falha ao ler auditoria', 500)
  }
}
