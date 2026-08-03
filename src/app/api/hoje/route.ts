import { NextRequest } from 'next/server'
import { okCached, err, handleError } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { ttlGetOrSet } from '@/lib/ttl-cache'
import { getSalonMetrics } from '@/lib/salon/metrics'
import { computeSalonIntelligence } from '@/lib/salon/intelligence'
import { listActionItems } from '@/lib/salon/recommendations'
import {
  countOverdueContacts,
  countOverdueServices,
  slicePlaybookForRole,
} from '@/lib/salon/playbook'
import { listTodaySchedules } from '@/lib/services'
import { getLastAvecSync } from '@/lib/avec/sync'
import { pickHojeAvecSyncRun, pickNewestUsableAvecRun } from '@/lib/avec/sync-run-health'
import { isAvecConfigured } from '@/lib/avec/client'
import { todayIso } from '@/lib/salon/format'
import { countDistinctContactIds } from '@/lib/salon/headcount'
import { resolveAppointmentsHeads } from '@/lib/salon/resolve-appointments'
import { compareScheduleByTimeThenName } from '@/lib/salon/sort'
import { getReactivationKpis } from '@/lib/salon/reactivation-kpi'
import { countWhatsappNovosToday, countNovosHoje } from '@/lib/hoje-leads'

/** Painel Hoje — métricas vêm do sync (read-only); cache curto no isolate. */
export const maxDuration = 30

const HOJE_CACHE_TTL_MS = 30_000

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const role = auth.session.role
    const canViewRevenue = auth.session.can_view_revenue
    const day = todayIso()

    const payload = await ttlGetOrSet(
      `hoje:v7:${day}:${role}:${canViewRevenue ? 'rev' : 'norev'}`,
      HOJE_CACHE_TTL_MS,
      async () => {
        // Sequencial no pooler max:1 — Promise.all competia consigo mesmo e com outras lambdas.
        const salonRaw = await getSalonMetrics(day)
        const playbookAll = await listActionItems({ limit: 60 })
        const scheduleRaw = await listTodaySchedules(day, 200)
        // novos: paridade Contatos Novos (main), janela = hoje apenas.
        const [novos, whatsapp_novos] = await Promise.all([
          countNovosHoje(day),
          countWhatsappNovosToday(day),
        ])
        // Hoje = caixa/agenda: badge pelo fast. Full só entra se não houver fast
        // (evita full parcial em P1 0107 pintar KPIs "incompleto" por horas).
        // Full KPI = ops/agenda/legado all — nunca catalog (dump não é analytics).
        const [avecFast, fullOps, fullAgenda, fullLegacy] = await Promise.all([
          getLastAvecSync('fast', { finishedOnly: true }),
          getLastAvecSync('full', { finishedOnly: true, stage: 'ops' }),
          getLastAvecSync('full', { finishedOnly: true, stage: 'agenda' }),
          getLastAvecSync('full', { finishedOnly: true, stage: 'all' }),
        ])
        const avecFull = pickNewestUsableAvecRun([fullOps, fullAgenda, fullLegacy])
        const avecLast = pickHojeAvecSyncRun(avecFast, avecFull)
        const reactivation = await getReactivationKpis().catch(() => ({
          window_days: 21,
          contacted: 0,
          reactivated: 0,
          rate: null as number | null,
        }))

        const playbookSlice = slicePlaybookForRole(playbookAll, role)
        const playbook = playbookSlice.items

        const scheduleToday = [...scheduleRaw].sort(compareScheduleByTimeThenName)
        const scheduleHeads = countDistinctContactIds(scheduleToday)
        const leads = { novos, whatsapp_novos }
        // Sem linha de métricas do dia: não inventar 0 operacional — null → UI "—".
        // Paridade Cérebro: CS/agenda vs metrics Avec (nunca appointments < attended).
        const appointmentsHeads = resolveAppointmentsHeads({
          metricAppt: salonRaw?.appointments,
          scheduleHeads,
          attended: salonRaw?.attended,
        })
        const salonBase = salonRaw
          ? { ...salonRaw, appointments: appointmentsHeads }
          : {
              day,
              revenue: null as number | null,
              appointments: appointmentsHeads,
              attended: null as number | null,
              no_shows: null as number | null,
              cancelled: null as number | null,
              new_clients: leads.novos,
              returning_clients: null as number | null,
              ticket_avg: null,
              service_duration_sum_minutes: 0,
              service_duration_count: 0,
              updated_at: new Date().toISOString(),
              _metrics_missing: true as const,
            }

        const tmTodayMinutes =
          salonBase.service_duration_count > 0
            ? Math.round(
                (salonBase.service_duration_sum_minutes / salonBase.service_duration_count) * 10,
              ) / 10
            : null

        const salon = canViewRevenue
          ? salonBase
          : {
              ...salonBase,
              revenue: null,
              ticket_avg: null,
            }

        const intelligence = canViewRevenue && salonRaw ? computeSalonIntelligence(salonRaw) : null

        return {
          day,
          salon,
          tm_today: { avg_minutes: tmTodayMinutes, sample_count: salonBase.service_duration_count },
          intelligence,
          can_view_revenue: canViewRevenue,
          role,
          playbook,
          playbook_focus: playbookSlice.focus,
          playbook_audience: playbookSlice.audience,
          scheduleToday,
          schedule_heads: scheduleHeads,
          schedule_services: scheduleToday.length,
          leads: {
            novos: leads.novos,
            whatsapp_sem_resposta: leads.whatsapp_novos,
          },
          overdue_contacts: countOverdueContacts(playbook),
          overdue_total: countOverdueServices(playbook),
          reactivation,
          avec: {
            configured: isAvecConfigured(),
            last: avecLast,
          },
        }
      },
    )

    return okCached(payload, 30)
  } catch (e) {
    return handleError(e)
  }
}
