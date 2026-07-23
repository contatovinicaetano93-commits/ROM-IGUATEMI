import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireFinance } from '@/lib/auth'
import { computeMonthOverview } from '@/lib/salon/month-overview'
import { buildMonthOverviewCsv } from '@/lib/salon/month-overview-export'

/** Overview do mês — fechamento ROM (admin + financeiro). */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireFinance(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const month = req.nextUrl.searchParams.get('month') ?? undefined
    if (month && !/^\d{4}-\d{2}$/.test(month)) {
      return err('Parâmetro month inválido (esperado YYYY-MM)', 422)
    }

    const format = req.nextUrl.searchParams.get('format')
    const materialize = req.nextUrl.searchParams.get('materialize') !== '0'
    const overview = await computeMonthOverview({ month, materialize })

    if (format === 'csv') {
      const csv = buildMonthOverviewCsv(overview)
      const filename = `overview_${overview.month}_${overview.panel}.csv`
      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store',
        },
      })
    }

    return ok(overview)
  } catch (e) {
    return handleError(e)
  }
}
