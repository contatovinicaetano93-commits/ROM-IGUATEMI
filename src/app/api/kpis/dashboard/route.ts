import { NextRequest } from 'next/server'
import { okCached, err, handleError } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { ttlGetOrSet } from '@/lib/ttl-cache'
import { fetchContactKpis } from '@/lib/salon/kpis'
import { monthToDateRange, computePeriodAnalytics } from '@/lib/salon/period-analytics'
import { eachDayInclusive } from '@/lib/salon/contact-kpi-chart'
import { fetchTmComparison } from '@/lib/salon/tm-metrics'
import { todayIso } from '@/lib/salon/format'
import {
  getLatestSalonP1Daily,
  getSalonP1DailyNear,
  type P1ProfessionalRow,
} from '@/lib/salon/p1-metrics'
import {
  resolveMonthWindow,
  resolvePreviousComparableWindow,
} from '@/lib/salon/month-window'
import { compareByNamePtBr } from '@/lib/salon/sort'
import { loadAvecSyncMeta } from '@/lib/avec/sync-meta'

function monthLastDay(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate()
  return `${monthKey}-${String(last).padStart(2, '0')}`
}

interface ProfessionalWithDelta extends P1ProfessionalRow {
  delta: { revenue: number | null; attended: number; occupancy: number | null } | null
}

/**
 * Bootstrap da Visão: um lambda, queries sequenciais.
 * Evita waterfall de 4 rotas × pooler max:1 no browser.
 */
export const maxDuration = 60

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const monthRaw = req.nextUrl.searchParams.get('month')?.trim()
    const month = monthRaw && /^\d{4}-\d{2}$/.test(monthRaw) ? monthRaw : null
    const canViewRevenue = auth.session.can_view_revenue
    const cacheKey = `kpis:dashboard:v3:${month ?? 'latest'}:rev=${canViewRevenue ? 1 : 0}`

    const data = await ttlGetOrSet(cacheKey, 45_000, async () => {
      // 1) Contact KPIs
      let kpis
      if (month) {
        const { from, to } = monthToDateRange(month)
        const days = eachDayInclusive(from, to).length
        const raw = await fetchContactKpis(Math.max(1, days), to)
        kpis = {
          ...raw,
          byDay: raw.byDay.filter((r) => r.day >= from && r.day <= to),
          window: { from, to, days },
        }
      } else {
        kpis = await fetchContactKpis(30)
      }

      // 2) TM
      const referenceDay = month ? monthToDateRange(month).to : todayIso()
      const tm = {
        ...(await fetchTmComparison(referenceDay)),
        note: 'Média da duração real do atendimento (início/fim no 0002) — catálogo 0223 não entra no KPI.',
      }

      // 3) Ranking profissionais (mesma lógica de /api/kpis/performance)
      const today = todayIso()
      const currentMonth = today.slice(0, 7)
      const reference =
        month != null
          ? await getSalonP1DailyNear(month === currentMonth ? today : monthLastDay(month))
          : await getLatestSalonP1Daily()

      let performance: {
        month: string | null
        reference_day: string | null
        compare_day: string | null
        compare_label: string | null
        compare_mtd_aligned: boolean
        professionals: ProfessionalWithDelta[]
        can_view_revenue: boolean
      }

      if (!reference) {
        performance = {
          month,
          reference_day: null,
          compare_day: null,
          compare_label: null,
          compare_mtd_aligned: false,
          professionals: [],
          can_view_revenue: canViewRevenue,
        }
      } else {
        const refMonth = reference.day.slice(0, 7)
        if (month && refMonth !== month) {
          performance = {
            month,
            reference_day: null,
            compare_day: null,
            compare_label: null,
            compare_mtd_aligned: false,
            professionals: [],
            can_view_revenue: canViewRevenue,
          }
        } else {
          // MTD → mesmo dia do mês anterior; mês fechado → mês anterior cheio.
          const window = resolveMonthWindow(month ?? refMonth, reference.day)
          const prevWindow = resolvePreviousComparableWindow(window)
          const compare = await getSalonP1DailyNear(prevWindow.to, { maxSkewDays: 3 })
          const compareByName = new Map((compare?.professionals ?? []).map((p) => [p.name, p]))

          const professionals: ProfessionalWithDelta[] = reference.professionals
            .map((p) => {
              const prev = compareByName.get(p.name)
              return {
                ...p,
                revenue: canViewRevenue ? p.revenue : (null as unknown as number),
                ticket_avg: canViewRevenue ? p.ticket_avg : (null as unknown as number),
                delta: prev
                  ? {
                      revenue: canViewRevenue ? p.revenue - prev.revenue : null,
                      attended: p.attended - prev.attended,
                      occupancy:
                        p.occupancy != null && prev.occupancy != null
                          ? p.occupancy - prev.occupancy
                          : null,
                    }
                  : null,
              }
            })
            .sort((a, b) =>
              canViewRevenue
                ? Number(b.revenue ?? 0) - Number(a.revenue ?? 0) || compareByNamePtBr(a.name, b.name)
                : b.attended - a.attended || compareByNamePtBr(a.name, b.name),
            )

          performance = {
            month: month ?? refMonth,
            reference_day: reference.day,
            compare_day: compare && compare.day !== reference.day ? compare.day : null,
            compare_label: prevWindow.label,
            compare_mtd_aligned: prevWindow.mtd_aligned,
            professionals,
            can_view_revenue: canViewRevenue,
          }
        }
      }

      // 4) Período + sync-meta (igual BR)
      const periodBase = await computePeriodAnalytics({ month: month ?? undefined })
      const sync = await loadAvecSyncMeta()

      const period = canViewRevenue
        ? { ...periodBase, sync, can_view_revenue: true as const }
        : {
            ...periodBase,
            revenue: null,
            ticket_avg: null,
            lost_revenue: null,
            packages_revenue: null,
            packages: periodBase.packages.map((p) => ({ ...p, revenue: null })),
            top_professionals: periodBase.top_professionals.map((p) => ({ ...p, revenue: null })),
            top_services: periodBase.top_services.map((s) => ({ ...s, revenue: null })),
            previous: {
              ...periodBase.previous,
              revenue: null,
              ticket_avg: null,
            },
            sync,
            can_view_revenue: false as const,
          }

      return { kpis, tm, performance, period }
    })

    return okCached(data, 45)
  } catch (e) {
    return handleError(e)
  }
}
