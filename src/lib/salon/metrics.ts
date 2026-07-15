import { getSql } from '@/lib/db'
import { todayIso } from '@/lib/salon/format'

export interface SalonDailyMetrics {
  day: string
  revenue: number
  appointments: number
  attended: number
  no_shows: number
  cancelled: number
  new_clients: number
  returning_clients: number
  ticket_avg: number | null
  service_duration_sum_minutes: number
  service_duration_count: number
  updated_at: string
}

export interface SalonMetricsPatch {
  revenue?: number
  appointments?: number
  attended?: number
  no_shows?: number
  cancelled?: number
  new_clients?: number
  returning_clients?: number
  ticket_avg?: number | null
  service_duration_sum_minutes?: number
  service_duration_count?: number
}

export async function getSalonMetrics(day = todayIso()): Promise<SalonDailyMetrics | null> {
  const sql = getSql()
  const rows = (await sql`
    select * from salon_daily_metrics where day = ${day}::date limit 1
  `) as SalonDailyMetrics[]
  return rows[0] ?? null
}

export async function upsertSalonMetrics(day: string, patch: SalonMetricsPatch) {
  const sql = getSql()
  const existing = await getSalonMetrics(day)
  const revenue = patch.revenue ?? existing?.revenue ?? 0
  const appointments = patch.appointments ?? existing?.appointments ?? 0
  const attended = patch.attended ?? existing?.attended ?? 0
  const no_shows = patch.no_shows ?? existing?.no_shows ?? 0
  const cancelled = patch.cancelled ?? existing?.cancelled ?? 0
  const new_clients = patch.new_clients ?? existing?.new_clients ?? 0
  const returning_clients = patch.returning_clients ?? existing?.returning_clients ?? 0
  const ticket_avg =
    patch.ticket_avg !== undefined
      ? patch.ticket_avg
      : attended > 0
        ? revenue / attended
        : existing?.ticket_avg ?? null
  const service_duration_sum_minutes =
    patch.service_duration_sum_minutes ?? existing?.service_duration_sum_minutes ?? 0
  const service_duration_count = patch.service_duration_count ?? existing?.service_duration_count ?? 0

  await sql`
    insert into salon_daily_metrics (
      day, revenue, appointments, attended, no_shows, cancelled,
      new_clients, returning_clients, ticket_avg,
      service_duration_sum_minutes, service_duration_count, updated_at
    )
    values (
      ${day}::date, ${revenue}, ${appointments}, ${attended}, ${no_shows}, ${cancelled},
      ${new_clients}, ${returning_clients}, ${ticket_avg},
      ${service_duration_sum_minutes}, ${service_duration_count}, now()
    )
    on conflict (day) do update set
      revenue = excluded.revenue,
      appointments = excluded.appointments,
      attended = excluded.attended,
      no_shows = excluded.no_shows,
      cancelled = excluded.cancelled,
      new_clients = excluded.new_clients,
      returning_clients = excluded.returning_clients,
      ticket_avg = excluded.ticket_avg,
      service_duration_sum_minutes = excluded.service_duration_sum_minutes,
      service_duration_count = excluded.service_duration_count,
      updated_at = now()
  `
}

// Recalcula só métricas ROM (agendamentos, novos, retornos) — não mexe em revenue/attended/no-show do Avec.
export async function recomputeSalonMetricsFromRom(day = todayIso()) {
  const sql = getSql()

  const [apptRows, newRows, returningRows] = await Promise.all([
    sql`
      select count(*)::int as n from client_services
      where active = true
        and scheduled_at is not null
        and (scheduled_at at time zone 'America/Sao_Paulo')::date = ${day}::date
    `,
    sql`
      select count(*)::int as n from contacts
      where (created_at at time zone 'America/Sao_Paulo')::date = ${day}::date
    `,
    sql`
      select count(*)::int as n from contacts
      where status = 'convertido'
        and (created_at at time zone 'America/Sao_Paulo')::date < ${day}::date
        and (last_contact_at at time zone 'America/Sao_Paulo')::date = ${day}::date
    `,
  ])

  await upsertSalonMetrics(day, {
    appointments: (apptRows[0] as { n: number }).n,
    new_clients: (newRows[0] as { n: number }).n,
    returning_clients: (returningRows[0] as { n: number }).n,
  })
}
