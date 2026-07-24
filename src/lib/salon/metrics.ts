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
  // null = “não alterar” no ON CONFLICT (permite sync paralelo de receita/cancel sem race).
  const revenue = patch.revenue ?? null
  const appointments = patch.appointments ?? null
  const attended = patch.attended ?? null
  const no_shows = patch.no_shows ?? null
  const cancelled = patch.cancelled ?? null
  const new_clients = patch.new_clients ?? null
  const returning_clients = patch.returning_clients ?? null
  const ticketExplicit = patch.ticket_avg !== undefined
  const ticket_avg = ticketExplicit ? patch.ticket_avg : null
  const recomputeTicket =
    !ticketExplicit && (patch.revenue !== undefined || patch.attended !== undefined)
  const service_duration_sum_minutes = patch.service_duration_sum_minutes ?? null
  const service_duration_count = patch.service_duration_count ?? null

  await sql`
    insert into salon_daily_metrics (
      day, revenue, appointments, attended, no_shows, cancelled,
      new_clients, returning_clients, ticket_avg,
      service_duration_sum_minutes, service_duration_count, updated_at
    )
    values (
      ${day}::date,
      coalesce(${revenue}, 0),
      coalesce(${appointments}, 0),
      coalesce(${attended}, 0),
      coalesce(${no_shows}, 0),
      coalesce(${cancelled}, 0),
      coalesce(${new_clients}, 0),
      coalesce(${returning_clients}, 0),
      ${ticket_avg},
      coalesce(${service_duration_sum_minutes}, 0),
      coalesce(${service_duration_count}, 0),
      now()
    )
    on conflict (day) do update set
      revenue = coalesce(${revenue}, salon_daily_metrics.revenue),
      appointments = coalesce(${appointments}, salon_daily_metrics.appointments),
      attended = coalesce(${attended}, salon_daily_metrics.attended),
      no_shows = coalesce(${no_shows}, salon_daily_metrics.no_shows),
      cancelled = coalesce(${cancelled}, salon_daily_metrics.cancelled),
      new_clients = coalesce(${new_clients}, salon_daily_metrics.new_clients),
      returning_clients = coalesce(${returning_clients}, salon_daily_metrics.returning_clients),
      ticket_avg = case
        when ${ticketExplicit} then ${ticket_avg}
        when ${recomputeTicket} then case
          when coalesce(${attended}, salon_daily_metrics.attended) > 0
          then coalesce(${revenue}, salon_daily_metrics.revenue)
               / coalesce(${attended}, salon_daily_metrics.attended)::float
          else null
        end
        else salon_daily_metrics.ticket_avg
      end,
      service_duration_sum_minutes = coalesce(
        ${service_duration_sum_minutes},
        salon_daily_metrics.service_duration_sum_minutes
      ),
      service_duration_count = coalesce(
        ${service_duration_count},
        salon_daily_metrics.service_duration_count
      ),
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
    ` as unknown as Promise<{ n: number }[]>,
    sql`
      select count(*)::int as n from contacts
      where (created_at at time zone 'America/Sao_Paulo')::date = ${day}::date
    ` as unknown as Promise<{ n: number }[]>,
    sql`
      select count(*)::int as n from contacts
      where status = 'convertido'
        and (created_at at time zone 'America/Sao_Paulo')::date < ${day}::date
        and (last_contact_at at time zone 'America/Sao_Paulo')::date = ${day}::date
    ` as unknown as Promise<{ n: number }[]>,
  ])

  await upsertSalonMetrics(day, {
    appointments: apptRows[0].n,
    new_clients: newRows[0].n,
    returning_clients: returningRows[0].n,
  })
}
