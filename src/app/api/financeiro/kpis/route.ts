import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireFinance } from '@/lib/auth'
import { computeFinanceKpis } from '@/lib/finance'

export async function GET(req: NextRequest) {
  try {
    const auth = await requireFinance(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const month = req.nextUrl.searchParams.get('month') ?? undefined
    const compareMonth = req.nextUrl.searchParams.get('compare') ?? undefined
    if (month && !/^\d{4}-\d{2}$/.test(month)) return err('Parâmetro month inválido (esperado YYYY-MM)', 422)
    if (compareMonth && !/^\d{4}-\d{2}$/.test(compareMonth))
      return err('Parâmetro compare inválido (esperado YYYY-MM)', 422)

    const kpis = await computeFinanceKpis({ month, compareMonth })
    return ok(kpis)
  } catch (e) {
    return handleError(e)
  }
}
