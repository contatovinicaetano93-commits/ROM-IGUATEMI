import { NextRequest } from 'next/server'
import { err, ok } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { getRomPanelId } from '@/lib/brand'
import { canAccessFolha } from '@/lib/folha/access'
import { folhaRulesSummary } from '@/lib/folha/rules'
import type { FolhaShellStatus } from '@/lib/folha/types'

export async function GET(req: NextRequest) {
  const auth = await requireSession(req)
  if (!auth.ok) return err(auth.message, auth.status)
  if (!canAccessFolha(auth.session)) return err('Acesso restrito à Folha de pagamento', 403)

  const panel = getRomPanelId()
  const rules = folhaRulesSummary(panel)

  const payload: FolhaShellStatus = {
    shell_only: true,
    rules_locked: true,
    message:
      'Regras travadas (caderno RH 17/11 + Fopag). Próximo passo: montar rascunho da quinzena a partir do relatório 8123 Avec.',
    rules,
    periods: [],
  }
  return ok(payload)
}
