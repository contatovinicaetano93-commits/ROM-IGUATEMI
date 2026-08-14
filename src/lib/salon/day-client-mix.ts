import { getSql } from '@/lib/db'

export type DayClientMix = {
  /** 1ª visita no dia: cadastro criado no dia + 1º last_done no dia + sem visita anterior. */
  new_clients: number
  /** Já vinham: visita/last_done antes, ou já estavam na base ROM antes do dia. */
  returning_clients: number
  /** Distinct contact_id com last_done no dia. */
  attended_people: number
}

/**
 * Mix 1ª visita × recorrente a partir da base ROM.
 *
 * Não usa `total_visitas` do 0002 (é da janela do relatório).
 *
 * Histórico de `last_done` no ROM é incompleto (muita gente só ganha carimbo
 * no dia em que o sync marca done). Por isso:
 * - **1ª visita** = contact criado no dia (SP) + primeiro last_done no dia +
 *   sem visita anterior em salon_client_visits
 * - **Já vinham** = todo o resto atendido no dia (já estava na base ou tem
 *   evidência de visita anterior)
 */
export async function computeDayClientMix(day: string): Promise<DayClientMix> {
  const sql = getSql()
  const hasVisits = await salonClientVisitsExists(sql)

  if (hasVisits) {
    const rows = (await sql`
      with attended as (
        select distinct
          cs.contact_id,
          (c.created_at at time zone 'America/Sao_Paulo')::date as created_sp,
          nullif(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), '') as digits,
          lower(trim(regexp_replace(coalesce(c.name, ''), '^[0-9]+\s*-\s*', ''))) as name_norm
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
      prior as (
        select distinct a.contact_id
        from attended a
        where exists (
          select 1
          from client_services cs
          where cs.contact_id = a.contact_id
            and cs.active = true
            and cs.last_done_at is not null
            and (cs.last_done_at at time zone 'America/Sao_Paulo')::date < ${day}::date
        )
        or exists (
          select 1
          from salon_client_visits v
          where v.source_report = '0002'
            and v.visited_on < ${day}::date
            and a.digits is not null
            and length(a.digits) >= 8
            and (
              v.client_key = 'p:' || right(a.digits, 11)
              or right(regexp_replace(coalesce(v.phone, ''), '\D', '', 'g'), 11) = right(a.digits, 11)
              or right(regexp_replace(coalesce(v.mobile, ''), '\D', '', 'g'), 11) = right(a.digits, 11)
            )
        )
        or exists (
          select 1
          from salon_client_visits v
          where v.source_report = '0002'
            and v.visited_on < ${day}::date
            and length(a.name_norm) >= 5
            and (
              v.client_key = 'n:' || a.name_norm
              or lower(trim(regexp_replace(coalesce(v.client_name, ''), '^[0-9]+\s*-\s*', ''))) = a.name_norm
            )
        )
      )
      select
        count(*)::int as attended_people,
        count(*) filter (
          where cf.first_on = ${day}::date
            and a.created_sp = ${day}::date
            and p.contact_id is null
        )::int as new_clients,
        count(*) filter (
          where not (
            cf.first_on = ${day}::date
            and a.created_sp = ${day}::date
            and p.contact_id is null
          )
        )::int as returning_clients
      from attended a
      join cs_first cf on cf.contact_id = a.contact_id
      left join prior p on p.contact_id = a.contact_id
    `) as DayClientMix[]
    return normalizeMix(rows[0])
  }

  const rows = (await sql`
    with attended as (
      select distinct
        cs.contact_id,
        (c.created_at at time zone 'America/Sao_Paulo')::date as created_sp
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
      count(*) filter (
        where cf.first_on = ${day}::date and a.created_sp = ${day}::date
      )::int as new_clients,
      count(*) filter (
        where not (cf.first_on = ${day}::date and a.created_sp = ${day}::date)
      )::int as returning_clients
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
