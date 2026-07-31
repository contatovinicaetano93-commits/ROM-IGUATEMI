import { NextRequest } from 'next/server'
import { okCached, err, handleError } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { ttlGetOrSet } from '@/lib/ttl-cache'
import { getSql } from '@/lib/db'
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
import { isAvecConfigured } from '@/lib/avec/client'
import { todayIso } from '@/lib/salon/format'
import { countDistinctContactIds } from '@/lib/salon/headcount'
import { compareScheduleByTimeThenName } from '@/lib/salon/sort'
import { getReactivationKpis } from '@/lib/salon/reactivation-kpi'

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
      `hoje:v5:${day}:${role}:${canViewRevenue ? 'rev' : 'norev'}`,
      HOJE_CACHE_TTL_MS,
      async () => {
        const sql = getSql()

        // Sequencial no pooler max:1 — Promise.all competia consigo mesmo e com outras lambdas.
        const salonRaw = await getSalonMetrics(day)
        const playbookAll = await listActionItems({ limit: 60 })
        const scheduleRaw = await listTodaySchedules(day, 200)
        const leadRows = (await sql`
          select
            count(*) filter (
              where status <> 'importado'
                and coalesce(source, '') not like 'avec_sync_clients%'
                and coalesce(source, '') not like 'avec_backfill%'
                and coalesce(source, '') not like 'avec_lake%'
            )::int as novos,
            count(*) filter (
              where channel = 'whatsapp' and status = 'novo'
            )::int as whatsapp_novos
          from contacts
          where anonymized_at is null
            and created_at >= (${day}::date::timestamp at time zone 'America/Sao_Paulo')
            and created_at < ((${day}::date + 1)::timestamp at time zone 'America/Sao_Paulo')
        `) as { novos: number; whatsapp_novos: number }[]
        // Hoje = caixa/agenda: badge pelo fast. Full só entra se não houver fast
        // (evita full parcial em P1 0107 pintar KPIs "incompleto" por horas).
        const avecLast =
          (await getLastAvecSync('fast', { finishedOnly: true })) ??
          (await getLastAvecSync('full', { finishedOnly: true }))
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
        const leads = leadRows[0] ?? { novos: 0, whatsapp_novos: 0 }
        // Sem linha de métricas do dia: não inventar 0 operacional — null → UI "—".
        const salonBase = salonRaw
          ? salonRaw
          : {
              day,
              revenue: null as number | null,
              appointments: scheduleHeads,
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
