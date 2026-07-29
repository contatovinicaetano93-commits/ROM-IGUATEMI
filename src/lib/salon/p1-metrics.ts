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
 * syncP1Kpis grava um snapshot por dia, mas cada snapshot já é uma janela
 * rolante de 30 dias (não um delta diário) — então "comparação de período"
 * aqui é o snapshot mais recente vs o snapshot disponível mais próximo de N
 * dias atrás, não meses de calendário como no TM.
 */
export async function getSalonP1DailyNear(
  targetDay: string,
  opts?: { maxSkewDays?: number },
): Promise<SalonP1Daily | null> {
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
    const row = mapSalonP1Row(rows[0])
    if (!row || opts?.maxSkewDays == null) return row
    const minDay = addDaysIso(targetDay, -Math.max(0, Math.floor(opts.maxSkewDays)))
    return row.day >= minDay ? row : null
  } catch {
    return null
  }
}

function addDaysIso(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

/**
 * Último dia civil do mês imediatamente anterior a `day` (YYYY-MM-DD).
 * Usado no ranking MoM (snapshot atual vs EOM do mês passado).
 */
export function previousCalendarMonthEnd(day: string): string {
  const y = Number(day.slice(0, 4))
  const m = Number(day.slice(5, 7))
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    return addDaysIso(day, -30)
  }
  // Dia 0 do mês `m` = último dia do mês anterior.
  const d = new Date(Date.UTC(y, m - 1, 0))
  return d.toISOString().slice(0, 10)
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
