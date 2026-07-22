import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { getSql } from '@/lib/db'
import { getSalonMetrics, recomputeSalonMetricsFromRom } from '@/lib/salon/metrics'
import { computeSalonIntelligence } from '@/lib/salon/intelligence'
import { listActionItems } from '@/lib/salon/recommendations'
import { listUpcomingSchedules } from '@/lib/services'
import { getLastAvecSync } from '@/lib/avec/sync'
import { isAvecConfigured } from '@/lib/avec/client'
import { todayIso } from '@/lib/salon/format'
import { compareScheduleByTimeThenName } from '@/lib/salon/sort'
import { getReactivationKpis } from '@/lib/salon/reactivation-kpi'

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession(req)
    if (!auth.ok) return err(auth.message, auth.status)

    await recomputeSalonMetricsFromRom().catch(() => {})

    const day = todayIso()
    const sql = getSql()

    const [salonRaw, playbook, scheduleRaw, leadRows, avecLast, reactivation] = await Promise.all([
      getSalonMetrics(day),
      listActionItems(),
      // Hoje + próximos dias, ordenados por data/hora (mais próximo primeiro).
      listUpcomingSchedules(7, 150),
      sql`
        select
          count(*) filter (where status = 'novo')::int as novos,
          count(*) filter (where status = 'novo' and channel = 'whatsapp')::int as whatsapp_novos
        from contacts
      ` as unknown as Promise<{ novos: number; whatsapp_novos: number }[]>,
      getLastAvecSync(),
      getReactivationKpis().catch(() => ({
        window_days: 21,
        contacted: 0,
        reactivated: 0,
        rate: null as number | null,
      })),
    ])

    const scheduleToday = [...scheduleRaw].sort(compareScheduleByTimeThenName)
    const leads = leadRows[0]
    const salonBase = salonRaw ?? {
      day,
      revenue: 0,
      appointments: scheduleToday.length,
      attended: 0,
      no_shows: 0,
      cancelled: 0,
      new_clients: leads.novos,
      returning_clients: 0,
      ticket_avg: null,
      service_duration_sum_minutes: 0,
      service_duration_count: 0,
      updated_at: new Date().toISOString(),
    }

    // TM (Sprint 1) — null enquanto a Avec não mandar início/fim reais do atendimento.
    const tmTodayMinutes =
      salonBase.service_duration_count > 0
        ? Math.round((salonBase.service_duration_sum_minutes / salonBase.service_duration_count) * 10) / 10
        : null

    const salon = auth.session.can_view_revenue
      ? salonBase
      : {
          ...salonBase,
          revenue: null,
          ticket_avg: null,
        }

    // KPI de meta/risco depende de faturamento — mesma regra de visibilidade do staff.
    const intelligence = auth.session.can_view_revenue
      ? computeSalonIntelligence(salonBase)
      : null

    return ok({
      day,
      salon,
      tm_today: { avg_minutes: tmTodayMinutes, sample_count: salonBase.service_duration_count },
      intelligence,
      can_view_revenue: auth.session.can_view_revenue,
      role: auth.session.role,
      playbook: playbook.slice(0, 8),
      scheduleToday,
      leads: {
        novos: leads.novos,
        whatsapp_sem_resposta: leads.whatsapp_novos,
      },
      overdue_total: playbook.reduce((s, a) => s + a.overdue, 0),
      reactivation,
      avec: {
        configured: isAvecConfigured(),
        last: avecLast,
      },
    })
  } catch (e) {
    return handleError(e)
  }
}
