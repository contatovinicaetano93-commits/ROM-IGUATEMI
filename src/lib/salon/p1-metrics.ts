import { getSql } from '@/lib/db'

export interface P1ProfessionalRow {
  name: string
  revenue: number
  attended: number
  ticket_avg: number
  occupancy: number
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
  const cur = existing[0]

  const professionals = patch.professionals ?? (cur?.professionals as P1ProfessionalRow[] | undefined) ?? []
  const services = patch.services ?? (cur?.services as P1ServiceRow[] | undefined) ?? []
  const acquisition = patch.acquisition ?? (cur?.acquisition as P1AcquisitionRow[] | undefined) ?? []
  const reactivation_count =
    patch.reactivation_count ?? Number(cur?.reactivation_count ?? 0)

  await sql`
    insert into salon_p1_daily (
      day, professionals, services, acquisition, reactivation_count, updated_at
    )
    values (
      ${day}::date,
      ${JSON.stringify(professionals)}::jsonb,
      ${JSON.stringify(services)}::jsonb,
      ${JSON.stringify(acquisition)}::jsonb,
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
    return rows[0] ?? null
  } catch {
    return null
  }
}

/**
 * syncP1Kpis grava um snapshot por dia, mas cada snapshot já é uma janela
 * rolante de 30 dias (não um delta diário) — então "comparação de período"
 * aqui é o snapshot mais recente vs o snapshot disponível mais próximo de N
 * dias atrás, não meses de calendário como no TM.
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
    return rows[0] ?? null
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
    return rows[0] ?? null
  } catch {
    return null
  }
}
