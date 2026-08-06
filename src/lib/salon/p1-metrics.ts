import { getSql } from '@/lib/db'
import { asJsonArray } from '@/lib/jsonb'

export interface P1ProfessionalRow {
  name: string
  revenue: number
  attended: number
  ticket_avg: number
  /** Fração 0–1; null quando 0126 não trouxe ocupação para o profissional. */
  occupancy: number | null
}

export interface P1ServiceRow {
  name: string
  quantity: number
  revenue: number
}

export interface P1AcquisitionRow {
  channel: string
  clients: number
}

export interface SalonP1Daily {
  day: string
  professionals: P1ProfessionalRow[]
  services: P1ServiceRow[]
  acquisition: P1AcquisitionRow[]
  reactivation_count: number
  updated_at: string
}

export async function ensureSalonP1Table() {
  const sql = getSql()
  const exists = (await sql`
    select to_regclass('public.salon_p1_daily') is not null as ok
  `) as { ok: boolean }[]
  if (exists[0]?.ok) return

  await sql`
    create table if not exists salon_p1_daily (
      day date primary key,
      professionals jsonb not null default '[]',
      services jsonb not null default '[]',
      acquisition jsonb not null default '[]',
      reactivation_count int not null default 0,
      updated_at timestamptz not null default now()
    )
  `
}

export async function upsertSalonP1Daily(
  day: string,
  patch: {
    professionals?: P1ProfessionalRow[]
    services?: P1ServiceRow[]
    acquisition?: P1AcquisitionRow[]
    reactivation_count?: number
  },
) {
  await ensureSalonP1Table()
  const sql = getSql()
  const existing = (await sql`
    select * from salon_p1_daily where day = ${day}::date limit 1
  `) as SalonP1Daily[]
  const cur = mapSalonP1Row(existing[0] as SalonP1Daily | undefined)

  const professionals = patch.professionals ?? cur?.professionals ?? []
  const services = patch.services ?? cur?.services ?? []
  const acquisition = patch.acquisition ?? cur?.acquisition ?? []
  const reactivation_count =
    patch.reactivation_count ?? Number(cur?.reactivation_count ?? 0)

  await sql`
    insert into salon_p1_daily (
      day, professionals, services, acquisition, reactivation_count, updated_at
    )
    values (
      ${day}::date,
      ${professionals},
      ${services},
      ${acquisition},
      ${reactivation_count},
      now()
    )
    on conflict (day) do update set
      professionals = excluded.professionals,
      services = excluded.services,
      acquisition = excluded.acquisition,
      reactivation_count = excluded.reactivation_count,
      updated_at = now()
  `
}

function mapSalonP1Row(row: SalonP1Daily | undefined): SalonP1Daily | null {
  if (!row) return null
  return {
    ...row,
    professionals: asJsonArray<P1ProfessionalRow>(row.professionals),
    services: asJsonArray<P1ServiceRow>(row.services),
    acquisition: asJsonArray<P1AcquisitionRow>(row.acquisition),
  }
}

export async function getSalonP1Daily(day: string): Promise<SalonP1Daily | null> {
  const sql = getSql()
  try {
    const rows = (await sql`
      select
        day::text as day,
        professionals,
        services,
        acquisition,
        reactivation_count,
        updated_at
      from salon_p1_daily
      where day = ${day}::date
      limit 1
    `) as SalonP1Daily[]
    return mapSalonP1Row(rows[0])
  } catch {
    return null
  }
}

/**
 * syncP1Kpis grava um snapshot por dia com escopo de mês calendário até esse dia
 * (MTD no mês corrente). "Near" pega o snapshot mais recente em ou antes de
 * targetDay — a Visão compara mês atual vs fim do mês anterior.
 */
export async function getSalonP1DailyNear(targetDay: string): Promise<SalonP1Daily | null> {
  const sql = getSql()
  try {
    const rows = (await sql`
      select
        day::text as day,
        professionals,
        services,
        acquisition,
        reactivation_count,
        updated_at
      from salon_p1_daily
      where day <= ${targetDay}::date
      order by day desc
      limit 1
    `) as SalonP1Daily[]
    return mapSalonP1Row(rows[0])
  } catch {
    return null
  }
}

export async function getLatestSalonP1Daily(): Promise<SalonP1Daily | null> {
  const sql = getSql()
  try {
    const rows = (await sql`
      select
        day::text as day,
        professionals,
        services,
        acquisition,
        reactivation_count,
        updated_at
      from salon_p1_daily
      order by day desc
      limit 1
    `) as SalonP1Daily[]
    return mapSalonP1Row(rows[0])
  } catch {
    return null
  }
}

/** Corrige jsonb legado gravado como string (JSON.stringify + postgres.js). */
export async function repairSalonP1JsonbEncoding(): Promise<number> {
  const sql = getSql()
  const rows = (await sql`
    update salon_p1_daily set
      professionals = case
        when jsonb_typeof(professionals) = 'string' then (professionals #>> '{}')::jsonb
        else professionals
      end,
      services = case
        when jsonb_typeof(services) = 'string' then (services #>> '{}')::jsonb
        else services
      end,
      acquisition = case
        when jsonb_typeof(acquisition) = 'string' then (acquisition #>> '{}')::jsonb
        else acquisition
      end
    where jsonb_typeof(professionals) = 'string'
       or jsonb_typeof(services) = 'string'
       or jsonb_typeof(acquisition) = 'string'
    returning day
  `) as { day: string }[]
  return rows.length
}
