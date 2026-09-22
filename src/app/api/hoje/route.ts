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
import { countNewContactsNotInAvec } from '@/lib/contact-summary'
import { countWhatsappNovosToday } from '@/lib/hoje-leads'
import {
  filterByOwnedContactIds,
  filterByProfessionalName,
  listContactIdsOwnedByProfessional,
  professionalScopeCacheKey,
  resolveSessionProfessionalScope,
} from '@/lib/intranet/professional-scope'

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
    const proScope = await resolveSessionProfessionalScope(auth.session)
    const scopeKey = professionalScopeCacheKey(proScope)

    const payload = await ttlGetOrSet(
      `hoje:v9:${day}:${role}:${canViewRevenue ? 'rev' : 'norev'}:pro:${scopeKey}`,
      HOJE_CACHE_TTL_MS,
      async () => {
        // Sequencial no pooler max:1 — Promise.all competia consigo mesmo e com outras lambdas.
        const salonRaw = await getSalonMetrics(day)
        const playbookAll = await listActionItems({ limit: 60 })
        const scheduleRaw = await listTodaySchedules(day, 200)
        // novos: paridade com Contatos · Novos (últimos NOVOS_WINDOW_DAYS).
        // Profissional: não carrega leads/KPI unitários (sigilo).
        const [novos, whatsapp_novos] = proScope
          ? [null as number | null, null as number | null]
          : await Promise.all([
              countNewContactsNotInAvec({ day }),
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
        const reactivationUnit = proScope
          ? null
          : await getReactivationKpis().catch(() => ({
              window_days: 21,
              contacted: 0,
              reactivated: 0,
              rate: null as number | null,
            }))

        const playbookSlice = slicePlaybookForRole(playbookAll, role)
        let playbook = playbookSlice.items
        let scheduleToday = [...scheduleRaw].sort(compareScheduleByTimeThenName)

        if (proScope) {
          scheduleToday = filterByProfessionalName(scheduleToday, proScope)
          const ownedIds = await listContactIdsOwnedByProfessional(proScope)
          playbook = filterByOwnedContactIds(playbook, ownedIds)
        }

        const scheduleHeads = countDistinctContactIds(scheduleToday)
        const leads = { novos, whatsapp_novos }
        // Sem linha de métricas do dia: não inventar 0 operacional — null → UI "—".
        // Paridade Cérebro: CS/agenda vs metrics Avec (nunca appointments < attended).
        // Profissional: só cabeças da própria agenda — não misturar KPI da unidade.
        const appointmentsHeads = proScope
          ? scheduleHeads
          : resolveAppointmentsHeads({
              metricAppt: salonRaw?.appointments,
              scheduleHeads,
              attended: salonRaw?.attended,
            })
        const salonBase = proScope
          ? {
              day,
              revenue: null as number | null,
              appointments: appointmentsHeads,
              attended: null as number | null,
              no_shows: null as number | null,
              cancelled: null as number | null,
              new_clients: null as number | null,
              returning_clients: null as number | null,
              ticket_avg: null as number | null,
              service_duration_sum_minutes: 0,
              service_duration_count: 0,
              updated_at: new Date().toISOString(),
              _metrics_missing: true as const,
              _professional_scope: true as const,
            }
          : salonRaw
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

        const salon = canViewRevenue && !proScope
          ? salonBase
          : {
              ...salonBase,
              revenue: null,
              ticket_avg: null,
            }

        const intelligence =
          canViewRevenue && salonRaw && !proScope ? computeSalonIntelligence(salonRaw) : null

        const reactivation = reactivationUnit ?? {
          window_days: 21,
          contacted: null as number | null,
          reactivated: null as number | null,
          rate: null as number | null,
        }

        return {
          day,
          salon,
          tm_today: { avg_minutes: tmTodayMinutes, sample_count: salonBase.service_duration_count },
          intelligence,
          can_view_revenue: canViewRevenue && !proScope,
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
          professional_scope: proScope,
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
