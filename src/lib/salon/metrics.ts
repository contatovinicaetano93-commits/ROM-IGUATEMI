import { getSql } from '@/lib/db'
import { todayIso } from '@/lib/salon/format'
import { computeDayClientMix } from '@/lib/salon/day-client-mix'

export interface SalonDailyMetrics {
  day: string
  /** null = ainda não sincronizado (não inventar 0 no INSERT parcial). */
  revenue: number | null
  appointments: number | null
  attended: number | null
  no_shows: number | null
  cancelled: number | null
  new_clients: number | null
  returning_clients: number | null
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

  // Postgres/driver pode serializar number como texto; coalesce(param, 0) infere int e quebra
  // receita decimal (ex: 165304.8). Cast explícito evita isso.
  await sql`
    insert into salon_daily_metrics (
      day, revenue, appointments, attended, no_shows, cancelled,
      new_clients, returning_clients, ticket_avg,
      service_duration_sum_minutes, service_duration_count, updated_at
    )
    values (
      ${day}::date,
      ${revenue}::numeric,
      ${appointments}::int,
      ${attended}::int,
      ${no_shows}::int,
      ${cancelled}::int,
      ${new_clients}::int,
      ${returning_clients}::int,
      ${ticket_avg}::numeric,
      coalesce(${service_duration_sum_minutes}::numeric, 0::numeric),
      coalesce(${service_duration_count}::int, 0),
      now()
    )
    on conflict (day) do update set
      revenue = coalesce(${revenue}::numeric, salon_daily_metrics.revenue),
      appointments = coalesce(${appointments}::int, salon_daily_metrics.appointments),
      attended = coalesce(${attended}::int, salon_daily_metrics.attended),
      no_shows = coalesce(${no_shows}::int, salon_daily_metrics.no_shows),
      cancelled = coalesce(${cancelled}::int, salon_daily_metrics.cancelled),
      new_clients = coalesce(${new_clients}::int, salon_daily_metrics.new_clients),
      returning_clients = coalesce(${returning_clients}::int, salon_daily_metrics.returning_clients),
      ticket_avg = case
        when ${ticketExplicit} then ${ticket_avg}::numeric
        when ${recomputeTicket} then case
          when coalesce(${attended}::int, salon_daily_metrics.attended) > 0
          then coalesce(${revenue}::numeric, salon_daily_metrics.revenue)
               / coalesce(${attended}::int, salon_daily_metrics.attended)::float
          else null
        end
        else salon_daily_metrics.ticket_avg
      end,
      service_duration_sum_minutes = coalesce(
        ${service_duration_sum_minutes}::numeric,
        salon_daily_metrics.service_duration_sum_minutes
      ),
      service_duration_count = coalesce(
        ${service_duration_count}::int,
        salon_daily_metrics.service_duration_count
      ),
      updated_at = now()
  `
}

/**
 * Recalcula Agendados/Movimento do dia a partir do ROM (fallback/webhook).
 *
 * Mix 1ª visita × recorrente também vem da base ROM (`computeDayClientMix`) —
 * não do total_visitas do 0002 (janela do relatório).
 *
 * Movimento/Agendados = cabeças (DISTINCT contact_id) com aberto (scheduled_at)
 * ou concluído (last_done_at) no dia — não linhas de serviço.
 */
export async function recomputeSalonMetricsFromRom(day = todayIso()) {
  const sql = getSql()

  const apptRows = (await sql`
      select count(distinct cs.contact_id)::int as n
      from client_services cs
      join contacts c on c.id = cs.contact_id
      where cs.active = true
        and c.anonymized_at is null
        and (
          (
            cs.scheduled_at is not null
            and (cs.scheduled_at at time zone 'America/Sao_Paulo')::date = ${day}::date
            and (
              cs.last_done_at is null
              or (cs.last_done_at at time zone 'America/Sao_Paulo')::date <> ${day}::date
            )
          )
          or (
            cs.last_done_at is not null
            and (cs.last_done_at at time zone 'America/Sao_Paulo')::date = ${day}::date
          )
        )
    `) as unknown as { n: number }[]

  const mix = await computeDayClientMix(day)

  await upsertSalonMetrics(day, {
    appointments: apptRows[0].n,
    new_clients: mix.new_clients,
    returning_clients: mix.returning_clients,
  })
}
