import { ok, handleError } from '@/lib/api-response'
import { getSql } from '@/lib/db'
import { getSalonMetrics, recomputeSalonMetricsFromRom } from '@/lib/salon/metrics'
import { todayIso } from '@/lib/salon/format'
import { computeSalonIntelligence } from '@/lib/salon/intelligence'
import { getSalonUnit, unitDisplayLabel } from '@/lib/salon/unit'
import { listActionItems } from '@/lib/salon/recommendations'
import { listSchedulesForDay } from '@/lib/services'
import { getLastAvecSync } from '@/lib/avec/sync'
import { isAvecConfigured } from '@/lib/avec/client'

export async function GET() {
  try {
    const unit = getSalonUnit()
    const day = todayIso()
    await recomputeSalonMetricsFromRom(day).catch(() => {})

    const sql = getSql()

    const [salonRaw, playbook, scheduleToday, leadRows, avecLastFast, avecLastFull] =
      await Promise.all([
        getSalonMetrics(day),
        listActionItems(),
        listSchedulesForDay(day, 15),
        sql`
          select
            count(*) filter (where status = 'novo')::int as novos,
            count(*) filter (where status = 'novo' and channel = 'whatsapp')::int as whatsapp_novos
          from contacts
        `,
        getLastAvecSync('fast'),
        getLastAvecSync('full'),
      ])

    const leads = leadRows[0] as { novos: number; whatsapp_novos: number }

    const salon =
      salonRaw ??
      ({
        day,
        revenue: 0,
        appointments: scheduleToday.length,
        attended: 0,
        no_shows: 0,
        cancelled: 0,
        new_clients: leads.novos,
        returning_clients: 0,
        ticket_avg: null,
        updated_at: new Date().toISOString(),
      } as const)

    const intelligence = computeSalonIntelligence(salonRaw ?? salon)

    return ok({
      unit: {
        name: unit.name,
        slug: unit.slug,
        label: unitDisplayLabel(unit),
        brand: unit.brand,
      },
      day,
      salon,
      intelligence,
      playbook: playbook.slice(0, 8),
      scheduleToday,
      leads: {
        novos: leads.novos,
        whatsapp_sem_resposta: leads.whatsapp_novos,
      },
      overdue_total: playbook.reduce((s, a) => s + a.overdue, 0),
      avec: {
        configured: isAvecConfigured(),
        last_fast: avecLastFast,
        last_full: avecLastFull,
      },
    })
  } catch (e) {
    return handleError(e)
  }
}
