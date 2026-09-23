import { NextRequest } from 'next/server'
import { err, ok, handleError } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { findEmployeeById } from '@/lib/employees'
import { getOrFetchCommissionDiscounts0029 } from '@/lib/avec/fetch-commission-discounts'
import {
  resolveAvecProId,
  resolveMeuComissao,
  resolveMeuFaturamento,
} from '@/lib/intranet/meu-faturamento'
import {
  getLatestSalonCommissionsDaily,
  getSalonCommissionsDailyNear,
} from '@/lib/salon/commission-metrics'
import { getLatestSalonP1Daily, getSalonP1DailyNear } from '@/lib/salon/p1-metrics'
import { monthToDateRange } from '@/lib/salon/period-analytics'

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const monthParam = req.nextUrl.searchParams.get('month')?.trim()
    const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : null

    const employeeId = auth.session.employeeId
    const employee = employeeId ? await findEmployeeById(employeeId) : null
    const linkName =
      employee?.professional_name?.trim() ||
      employee?.name ||
      auth.session.displayName ||
      auth.session.user

    const p1Snapshot = month
      ? await getSalonP1DailyNear(monthToDateRange(month).to, { maxSkewDays: 14 })
      : await getLatestSalonP1Daily()

    const commissionSnapshot = month
      ? await getSalonCommissionsDailyNear(monthToDateRange(month).to, { maxSkewDays: 14 })
      : await getLatestSalonCommissionsDaily()

    // IG: p1-metrics / commission-metrics já normalizam via asJsonArray
    const professionals = p1Snapshot?.professionals ?? []
    const commissionRows = commissionSnapshot?.professionals ?? []

    const metrics = resolveMeuFaturamento(professionals, linkName)
    const commission = resolveMeuComissao(commissionRows, linkName)

    const avecProId = resolveAvecProId(linkName)
    const anchorDay =
      commissionSnapshot?.day ??
      p1Snapshot?.day ??
      (month ? monthToDateRange(month).to : null)
    const discounts = avecProId
      ? await getOrFetchCommissionDiscounts0029(avecProId, {
          anchorDay: anchorDay ?? undefined,
          maxSkewDays: 14,
        })
      : { lines: [], reference_day: null, avec_pro_id: null as string | null, source: 'none' as const }

    return ok({
      month: month ?? p1Snapshot?.day.slice(0, 7) ?? commissionSnapshot?.day.slice(0, 7) ?? null,
      reference_day: p1Snapshot?.day ?? null,
      commission_reference_day: commissionSnapshot?.day ?? null,
      discount_reference_day: discounts.reference_day,
      avec_pro_id: avecProId,
      link_name: linkName || null,
      linked: Boolean(employee?.professional_name?.trim() || employee?.name),
      employee_id: employee?.id ?? null,
      ...metrics,
      ...commission,
      discount_lines: discounts.lines,
      discount_source: discounts.source,
    })
  } catch (e) {
    return handleError(e)
  }
}
