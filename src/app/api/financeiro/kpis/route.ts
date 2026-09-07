import { NextRequest } from 'next/server'
import { okCached, err, handleError } from '@/lib/api-response'
import { requireFinance } from '@/lib/auth'
import { computeFinanceKpis } from '@/lib/finance'
import { ttlGetOrSet } from '@/lib/ttl-cache'
import { loadAvecSyncMeta } from '@/lib/avec/sync-meta'

export async function GET(req: NextRequest) {
  try {
    const auth = await requireFinance(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const month = req.nextUrl.searchParams.get('month') ?? undefined
    const compareMonth = req.nextUrl.searchParams.get('compare') ?? undefined
    if (month && !/^\d{4}-\d{2}$/.test(month)) return err('Parâmetro month inválido (esperado YYYY-MM)', 422)
    if (compareMonth && !/^\d{4}-\d{2}$/.test(compareMonth))
      return err('Parâmetro compare inválido (esperado YYYY-MM)', 422)

    const cacheKey = `financeiro:kpis:v3:${month ?? 'cur'}:${compareMonth ?? 'yoy'}`
    const data = await ttlGetOrSet(cacheKey, 45_000, async () => {
      const kpis = await computeFinanceKpis({ month, compareMonth })
      const sync = await loadAvecSyncMeta()
      return { ...kpis, sync }
    })
    return okCached(data, 30)
  } catch (e) {
    return handleError(e)
  }
}
