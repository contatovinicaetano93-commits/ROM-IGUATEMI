import { getSql } from '@/lib/db'
import { asJsonArray } from '@/lib/jsonb'

export interface P3CurvePoint {
  day: string
  revenue: number
}

export interface SalonP3Daily {
  day: string
  /** null = taxa ainda não sincronizada (não interpretar como 0%). */
  return_rate: number | null
  /** null = novos ainda não sincronizados (não interpretar como 0). */
  new_clients_period: number | null
  revenue_curve: P3CurvePoint[]
  updated_at: string
}

type SalonP3DailyRow = {
  day: string
  return_rate: number | null
  new_clients_period: number | null
  has_return_rate?: boolean | null
  has_new_clients?: boolean | null
  revenue_curve: unknown
  updated_at: string
}

let p3TableReady: Promise<void> | null = null

/** Mapeia linha DB → domínio (flags evitam 0% / 0 novos falsos). */
export function mapSalonP3DailyRow(row: SalonP3DailyRow): SalonP3Daily {
  const hasReturn =
    row.has_return_rate === true ||
    (row.has_return_rate == null && row.return_rate != null && Number(row.return_rate) > 0)
  const hasNew =
    row.has_new_clients === true ||
    (row.has_new_clients == null &&
      row.new_clients_period != null &&
      Number(row.new_clients_period) > 0)

  return {
    day: String(row.day).slice(0, 10),
    return_rate: hasReturn ? Number(row.return_rate) : null,
    new_clients_period: hasNew ? Number(row.new_clients_period) : null,
    revenue_curve: asJsonArray<P3CurvePoint>(row.revenue_curve),
    updated_at: String(row.updated_at),
  }
}

export async function ensureSalonP3Table() {
  if (!p3TableReady) {
    p3TableReady = (async () => {
      const sql = getSql()
      await sql`
        create table if not exists salon_p3_daily (
          day date primary key,
          return_rate numeric(6,4),
          new_clients_period int,
          revenue_curve jsonb not null default '[]',
          has_return_rate boolean not null default false,
          has_new_clients boolean not null default false,
          updated_at timestamptz not null default now()
        )
      `
      const cols = (await sql`
        select column_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'salon_p3_daily'
          and column_name in ('has_return_rate', 'has_new_clients')
      `) as { column_name: string }[]
      const names = new Set(cols.map((c) => c.column_name))
      if (!names.has('has_return_rate')) {
        await sql`alter table salon_p3_daily add column has_return_rate boolean not null default false`
        await sql`alter table salon_p3_daily alter column return_rate drop not null`.catch(() => {})
        await sql`
          update salon_p3_daily
          set has_return_rate = true
          where return_rate is not null and return_rate > 0
        `
      }
      if (!names.has('has_new_clients')) {
        await sql`alter table salon_p3_daily add column has_new_clients boolean not null default false`
        await sql`alter table salon_p3_daily alter column new_clients_period drop not null`.catch(
          () => {},
        )
        await sql`
          update salon_p3_daily
          set has_new_clients = true
          where new_clients_period is not null and new_clients_period > 0
        `
      }
    })().catch((err) => {
      p3TableReady = null
      throw err
    })
  }
  await p3TableReady
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
    select
      day::text as day,
      return_rate::float as return_rate,
      new_clients_period,
      has_return_rate,
      has_new_clients,
      revenue_curve,
      updated_at
    from salon_p3_daily where day = ${day}::date limit 1
  `) as SalonP3DailyRow[]
  const cur = existing[0]

  const has_return_rate =
    patch.return_rate !== undefined ? true : Boolean(cur?.has_return_rate)
  const return_rate =
    patch.return_rate !== undefined
      ? patch.return_rate
      : cur?.return_rate != null
        ? Number(cur.return_rate)
        : null

  const has_new_clients =
    patch.new_clients_period !== undefined ? true : Boolean(cur?.has_new_clients)
  const new_clients_period =
    patch.new_clients_period !== undefined
      ? patch.new_clients_period
      : cur?.new_clients_period != null
        ? Number(cur.new_clients_period)
        : null

  const revenue_curve =
    patch.revenue_curve ?? asJsonArray<P3CurvePoint>(cur?.revenue_curve) ?? []

  await sql`
    insert into salon_p3_daily (
      day, return_rate, new_clients_period, revenue_curve,
      has_return_rate, has_new_clients, updated_at
    )
    values (
      ${day}::date,
      ${return_rate},
      ${new_clients_period},
      ${revenue_curve},
      ${has_return_rate},
      ${has_new_clients},
      now()
    )
    on conflict (day) do update set
      return_rate = excluded.return_rate,
      new_clients_period = excluded.new_clients_period,
      revenue_curve = excluded.revenue_curve,
      has_return_rate = excluded.has_return_rate,
      has_new_clients = excluded.has_new_clients,
      updated_at = now()
  `
}

/**
 * Snapshot P3 mais recente ≤ targetDay.
 * return_rate / new_clients_period vêm da Avec (0007 / 0017).
 */
export async function getSalonP3DailyNear(targetDay: string): Promise<SalonP3Daily | null> {
  try {
    // Leitura sem DDL — Visão não pode pagar ensure+UPDATE a cada GET.
    const sql = getSql()
    const rows = (await sql`
      select
        day::text as day,
        return_rate::float as return_rate,
        new_clients_period,
        has_return_rate,
        has_new_clients,
        revenue_curve,
        updated_at
      from salon_p3_daily
      where day <= ${targetDay}::date
      order by day desc
      limit 1
    `) as SalonP3DailyRow[]
    const row = rows[0]
    return row ? mapSalonP3DailyRow(row) : null
  } catch {
    return null
  }
}

/** Corrige jsonb legado gravado como string (JSON.stringify + postgres.js). */
export async function repairSalonP3JsonbEncoding(): Promise<number> {
  const sql = getSql()
  const rows = (await sql`
    update salon_p3_daily set
      revenue_curve = case
        when jsonb_typeof(revenue_curve) = 'string' then (revenue_curve #>> '{}')::jsonb
        else revenue_curve
      end
    where jsonb_typeof(revenue_curve) = 'string'
    returning day
  `) as { day: string }[]
  return rows.length
}
