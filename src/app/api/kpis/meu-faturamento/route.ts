import { NextRequest } from 'next/server'
import { err, ok, handleError } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { findEmployeeById } from '@/lib/employees'
import { resolveMeuFaturamento } from '@/lib/intranet/meu-faturamento'
import { getLatestSalonP1Daily, getSalonP1DailyNear, type P1ProfessionalRow } from '@/lib/salon/p1-metrics'
import { monthToDateRange } from '@/lib/salon/period-analytics'
import { asJsonArray } from '@/lib/sql-json'

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const monthParam = req.nextUrl.searchParams.get('month')?.trim()
    const month =
      monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : null

    const employeeId = auth.session.employeeId
    const employee = employeeId ? await findEmployeeById(employeeId) : null
    const linkName =
      employee?.professional_name?.trim() || employee?.name || auth.session.displayName || auth.session.user

    const snapshot = month
      ? await getSalonP1DailyNear(monthToDateRange(month).to, { maxSkewDays: 14 })
      : await getLatestSalonP1Daily()

    const professionals = snapshot ? asJsonArray<P1ProfessionalRow>(snapshot.professionals) : []
    const metrics = resolveMeuFaturamento(professionals, linkName)

    return ok({
      month: month ?? snapshot?.day.slice(0, 7) ?? null,
      reference_day: snapshot?.day ?? null,
      link_name: linkName || null,
      linked: Boolean(employee?.professional_name?.trim() || employee?.name),
      employee_id: employee?.id ?? null,
      ...metrics,
    })
  } catch (e) {
    return handleError(e)
  }
}
