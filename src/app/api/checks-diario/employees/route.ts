import { NextRequest } from 'next/server'
import { err, ok } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { hasPanelModule, parseGrantableModules } from '@/lib/intranet/modules'
import { listAssignableEmployees } from '@/lib/checks-diario/service'

function canUseChecks(session: { role: string; modules?: unknown }): boolean {
  const role = session.role as 'admin' | 'staff' | 'financeiro' | 'estoque' | 'mkt'
  return hasPanelModule(role, parseGrantableModules(session.modules), 'checks_diario')
}

export async function GET(req: NextRequest) {
  const auth = await requireSession(req)
  if (!auth.ok) return err(auth.message, auth.status)
  if (!canUseChecks(auth.session)) return err('Acesso restrito a Checks diários', 403)

  try {
    const employees = await listAssignableEmployees(auth.session)
    return ok({ employees })
  } catch (error) {
    return err(error instanceof Error ? error.message : 'Falha ao listar colaboradores', 500)
  }
}
