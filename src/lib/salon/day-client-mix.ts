import { getSql } from '@/lib/db'

export type DayClientMix = {
  /** Cabeças com last_done no dia cuja 1ª conclusão conhecida no ROM é esse dia. */
  new_clients: number
  /** Cabeças com last_done no dia que já tinham visita antes (ROM e/ou salon_client_visits). */
  returning_clients: number
  /** Distinct contact_id com last_done no dia. */
  attended_people: number
}

/**
 * Mix 1ª visita × recorrente a partir da base ROM — não usa total_visitas do 0002
 * (esse campo é da janela do relatório; no fast de 2 dias quase todo mundo vira “novo”).
 *
 * 1ª visita = min(last_done_at) do contato é o dia, e sem visited_on anterior em
 * salon_client_visits (quando a tabela existe).
 * Recorrente = já tinha last_done antes OU histórico em salon_client_visits.
 */
export async function computeDayClientMix(day: string): Promise<DayClientMix> {
  const sql = getSql()
  const hasVisits = await salonClientVisitsExists(sql)

  if (hasVisits) {
    const rows = (await sql`
      with attended as (
        select distinct
          cs.contact_id,
          nullif(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), '') as digits,
          lower(trim(c.name)) as name_norm
        from client_services cs
        join contacts c on c.id = cs.contact_id
        where cs.active = true
          and c.anonymized_at is null
          and cs.last_done_at is not null
          and (cs.last_done_at at time zone 'America/Sao_Paulo')::date = ${day}::date
      ),
      cs_first as (
        select
          cs.contact_id,
          min((cs.last_done_at at time zone 'America/Sao_Paulo')::date) as first_on
        from client_services cs
        join attended a on a.contact_id = cs.contact_id
        where cs.active = true
          and cs.last_done_at is not null
        group by cs.contact_id
      ),
      visit_prior as (
        select distinct a.contact_id
        from attended a
        join salon_client_visits v
          on v.source_report = '0002'
         and v.visited_on < ${day}::date
         and (
           (
             a.digits is not null
             and length(a.digits) >= 8
             and v.client_key = 'p:' || right(a.digits, 11)
           )
           or (
             a.name_norm is not null
             and length(a.name_norm) >= 3
             and v.client_key = 'n:' || a.name_norm
           )
         )
      )
      select
        count(*)::int as attended_people,
        count(*) filter (
          where cf.first_on = ${day}::date and vp.contact_id is null
        )::int as new_clients,
        count(*) filter (
          where cf.first_on < ${day}::date or vp.contact_id is not null
        )::int as returning_clients
      from attended a
      join cs_first cf on cf.contact_id = a.contact_id
      left join visit_prior vp on vp.contact_id = a.contact_id
    `) as DayClientMix[]
    return normalizeMix(rows[0])
  }

  const rows = (await sql`
    with attended as (
      select distinct cs.contact_id
      from client_services cs
      join contacts c on c.id = cs.contact_id
      where cs.active = true
        and c.anonymized_at is null
        and cs.last_done_at is not null
        and (cs.last_done_at at time zone 'America/Sao_Paulo')::date = ${day}::date
    ),
    cs_first as (
      select
        cs.contact_id,
        min((cs.last_done_at at time zone 'America/Sao_Paulo')::date) as first_on
      from client_services cs
      join attended a on a.contact_id = cs.contact_id
      where cs.active = true
        and cs.last_done_at is not null
      group by cs.contact_id
    )
    select
      count(*)::int as attended_people,
      count(*) filter (where cf.first_on = ${day}::date)::int as new_clients,
      count(*) filter (where cf.first_on < ${day}::date)::int as returning_clients
    from attended a
    join cs_first cf on cf.contact_id = a.contact_id
  `) as DayClientMix[]
  return normalizeMix(rows[0])
}

function normalizeMix(row: DayClientMix | undefined): DayClientMix {
  return {
    attended_people: Number(row?.attended_people ?? 0) || 0,
    new_clients: Number(row?.new_clients ?? 0) || 0,
    returning_clients: Number(row?.returning_clients ?? 0) || 0,
  }
}

async function salonClientVisitsExists(
  sql: ReturnType<typeof getSql>,
): Promise<boolean> {
  try {
    const rows = (await sql`
      select to_regclass('public.salon_client_visits') is not null as ok
    `) as { ok: boolean }[]
    return Boolean(rows[0]?.ok)
  } catch {
    return false
  }
}
