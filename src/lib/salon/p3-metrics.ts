import { getSql } from '@/lib/db'

export interface P3CurvePoint {
  day: string
  revenue: number
}

export interface SalonP3Daily {
  day: string
  return_rate: number
  new_clients_period: number
  revenue_curve: P3CurvePoint[]
  updated_at: string
}

export async function ensureSalonP3Table() {
  const sql = getSql()
  await sql`
    create table if not exists salon_p3_daily (
      day date primary key,
      return_rate numeric(6,4) not null default 0,
      new_clients_period int not null default 0,
      revenue_curve jsonb not null default '[]',
      updated_at timestamptz not null default now()
    )
  `
}

export async function upsertSalonP3Daily(
  day: string,
  patch: {
    return_rate?: number
    new_clients_period?: number
    revenue_curve?: P3CurvePoint[]
  },
) {
  await ensureSalonP3Table()
  const sql = getSql()
  const existing = (await sql`
    select * from salon_p3_daily where day = ${day}::date limit 1
  `) as SalonP3Daily[]
  const cur = existing[0]

  const return_rate = patch.return_rate ?? Number(cur?.return_rate ?? 0)
  const new_clients_period = patch.new_clients_period ?? Number(cur?.new_clients_period ?? 0)
  const revenue_curve =
    patch.revenue_curve ?? (cur?.revenue_curve as P3CurvePoint[] | undefined) ?? []

  await sql`
    insert into salon_p3_daily (
      day, return_rate, new_clients_period, revenue_curve, updated_at
    )
    values (
      ${day}::date,
      ${return_rate},
      ${new_clients_period},
      ${JSON.stringify(revenue_curve)}::jsonb,
      now()
    )
    on conflict (day) do update set
      return_rate = excluded.return_rate,
      new_clients_period = excluded.new_clients_period,
      revenue_curve = excluded.revenue_curve,
      updated_at = now()
  `
}
