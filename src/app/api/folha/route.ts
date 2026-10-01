import { NextRequest } from 'next/server'
import { err, handleError, ok } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { getRomPanelId } from '@/lib/brand'
import { canAccessFolha } from '@/lib/folha/access'
import { formatPayDateBr } from '@/lib/folha/period'
import { folhaRulesSummary } from '@/lib/folha/rules'
import {
  buildUpcomingPayments,
  listFolhaPeriodSummaries,
  loadOrCreateFolhaDraft,
} from '@/lib/folha/service'
import type { FolhaShellStatus } from '@/lib/folha/types'

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession(req)
    if (!auth.ok) return err(auth.message, auth.status)
    if (!canAccessFolha(auth.session)) return err('Acesso restrito à Folha de pagamento', 403)

    const panel = getRomPanelId()
    const rules = folhaRulesSummary(panel)
    const periodParam = req.nextUrl.searchParams.get('period')?.trim()
    const dayParam = req.nextUrl.searchParams.get('day')?.trim()
    const referenceDay =
      dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : undefined

    const { draft, period, quinzena } = await loadOrCreateFolhaDraft(panel, {
      periodId: periodParam || undefined,
      referenceDay,
      actor: auth.session.user,
    })

    const periods = await listFolhaPeriodSummaries()
    const upcoming = buildUpcomingPayments()
    const withPay = draft?.lines.filter((l) => l.proposed_pay != null).length ?? 0

    const payload: FolhaShellStatus = {
      shell_only: draft == null,
      rules_locked: true,
      message: draft
        ? `${quinzena.label} · paga ${formatPayDateBr(quinzena.payDate)} · 8123 ${quinzena.from}–${draft.reference_day} · ${withPay}/${draft.line_count} com a_pagar.`
        : `Sem 8123 para ${quinzena.label} (${quinzena.from}–${quinzena.to}, paga ${formatPayDateBr(quinzena.payDate)}). Use Atualizar do 8123 ou outra quinzena.`,
      rules,
      draft,
      period_status: period?.status ?? null,
      period_id: period?.id ?? quinzena.id,
      selected_period_id: quinzena.id,
      pay_date: quinzena.payDate,
      upcoming_payments: upcoming,
      periods,
    }
    return ok(payload)
  } catch (e) {
    return handleError(e)
  }
}
