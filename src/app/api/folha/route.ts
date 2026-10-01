import { NextRequest } from 'next/server'
import { err, handleError, ok } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { getRomPanelId } from '@/lib/brand'
import { canAccessFolha } from '@/lib/folha/access'
import { loadFolhaDraftFromLatest8123 } from '@/lib/folha/draft-from-8123'
import { folhaRulesSummary } from '@/lib/folha/rules'
import type { FolhaShellStatus } from '@/lib/folha/types'

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession(req)
    if (!auth.ok) return err(auth.message, auth.status)
    if (!canAccessFolha(auth.session)) return err('Acesso restrito à Folha de pagamento', 403)

    const panel = getRomPanelId()
    const rules = folhaRulesSummary(panel)
    const dayParam = req.nextUrl.searchParams.get('day')?.trim()
    const referenceDay =
      dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : undefined

    const draft = await loadFolhaDraftFromLatest8123(panel, { referenceDay })

    const payload: FolhaShellStatus = {
      shell_only: draft == null,
      rules_locked: true,
      message: draft
        ? `Rascunho montado a partir do 8123 (${draft.reference_day}). Conferir e liberar.`
        : 'Regras travadas. Ainda sem snapshot 8123 — rode o sync full/daily ou aguarde o cron.',
      rules,
      draft,
      periods: draft
        ? [
            {
              id: draft.quinzena.id,
              label: draft.quinzena.label,
              status: 'draft',
              reference_day: draft.reference_day,
              line_count: draft.line_count,
              total_proposed_pay: draft.total_proposed_pay,
            },
          ]
        : [],
    }
    return ok(payload)
  } catch (e) {
    return handleError(e)
  }
}
