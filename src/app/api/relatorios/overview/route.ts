import { NextRequest } from 'next/server'
import { ok, okCached, err, handleError } from '@/lib/api-response'
import { requireFinance } from '@/lib/auth'
import { computeMonthOverview } from '@/lib/salon/month-overview'
import { buildMonthOverviewCsv } from '@/lib/salon/month-overview-export'
import { ttlGetOrSet } from '@/lib/ttl-cache'
import { loadAvecSyncMeta } from '@/lib/avec/sync-meta'

/** Atualizar fechamento (finance+analytics) — leitura rápida não usa este teto. */
export const maxDuration = 300

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
    // UI: só lê (cache salon_month_metrics quando existir). Materializa com ?materialize=1.
    const materialize = req.nextUrl.searchParams.get('materialize') === '1'
    const cacheKey = `relatorios:overview:v2:${month ?? 'cur'}:mat=${materialize ? 1 : 0}`
    const payload = materialize
      ? await (async () => {
          const overview = await computeMonthOverview({ month, materialize })
          const sync = await loadAvecSyncMeta()
          return { ...overview, sync }
        })()
      : await ttlGetOrSet(cacheKey, 60_000, async () => {
          const overview = await computeMonthOverview({ month, materialize: false })
          const sync = await loadAvecSyncMeta()
          return { ...overview, sync }
        })

    if (format === 'csv') {
      const csv = buildMonthOverviewCsv(payload)
      const filename = `overview_${payload.month}_${payload.panel}.csv`
      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store',
        },
      })
    }

    return materialize ? ok(payload) : okCached(payload, 45)
  } catch (e) {
    return handleError(e)
  }
}
