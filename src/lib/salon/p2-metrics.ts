import { getSql } from '@/lib/db'
import { asJsonArray } from '@/lib/jsonb'

export interface P2ChannelRow {
  channel: string
  count: number
}

export interface P2PackageRow {
  name: string
  quantity: number
  revenue: number
}

export interface P2PaymentRow {
  method: string
  amount: number
  share: number
}

export interface SalonP2Daily {
  day: string
  booking_channels: P2ChannelRow[]
  packages: P2PackageRow[]
  packages_sold: number
  ratings_avg: number
  ratings_count: number
  payment_mix: P2PaymentRow[]
  birthday_count: number
  updated_at: string
}

/** Agrega payment_mix (relatório 0081 da Avec) por método de pagamento num período — para reconciliação no Financeiro. */
export async function getPaymentMixRange(from: string, to: string): Promise<P2PaymentRow[]> {
  const sql = getSql()
  const rows = (await sql`
    select payment_mix from salon_p2_daily
    where day >= ${from}::date and day <= ${to}::date
  `) as { payment_mix: unknown }[]

  const totals = new Map<string, number>()
  for (const row of rows) {
    for (const p of asJsonArray<P2PaymentRow>(row.payment_mix)) {
      totals.set(p.method, (totals.get(p.method) ?? 0) + Number(p.amount))
    }
  }

  const total = [...totals.values()].reduce((a, b) => a + b, 0)
  return [...totals.entries()]
    .map(([method, amount]) => ({
      method,
      amount: Math.round(amount * 100) / 100,
      share: total > 0 ? Math.round((amount / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.amount - a.amount)
}

/**
 * Snapshot P2 mais recente ≤ targetDay.
 * booking_channels / packages são janelas rolantes (~30d) no sync full — não deltas diários.
 */
function mapSalonP2Row(row: SalonP2Daily | undefined): SalonP2Daily | null {
  if (!row) return null
  return {
    ...row,
    booking_channels: asJsonArray<P2ChannelRow>(row.booking_channels),
    packages: asJsonArray<P2PackageRow>(row.packages),
    payment_mix: asJsonArray<P2PaymentRow>(row.payment_mix),
  }
}

export async function getSalonP2DailyNear(targetDay: string): Promise<SalonP2Daily | null> {
  const sql = getSql()
  try {
    const rows = (await sql`
      select
        day::text as day,
        booking_channels,
        packages,
        packages_sold,
        ratings_avg::float as ratings_avg,
        ratings_count,
        payment_mix,
        birthday_count,
        updated_at
      from salon_p2_daily
      where day <= ${targetDay}::date
      order by day desc
      limit 1
    `) as SalonP2Daily[]
    return mapSalonP2Row(rows[0])
  } catch {
    return null
  }
}

export async function ensureSalonP2Table() {
  const sql = getSql()
  const exists = (await sql`
    select to_regclass('public.salon_p2_daily') is not null as ok
  `) as { ok: boolean }[]
  if (exists[0]?.ok) return

  await sql`
    create table if not exists salon_p2_daily (
      day date primary key,
      booking_channels jsonb not null default '[]',
      packages jsonb not null default '[]',
      packages_sold int not null default 0,
      ratings_avg numeric(4,2) not null default 0,
      ratings_count int not null default 0,
      payment_mix jsonb not null default '[]',
      birthday_count int not null default 0,
      updated_at timestamptz not null default now()
    )
  `
}

function jsonArrLen(v: unknown): number {
  return asJsonArray(v).length
}

/** Último dia com canais/pacotes/notas — usado quando o 0081 cria o dia sem comércio. */
async function previousCommerceSnapshot(day: string): Promise<SalonP2Daily | null> {
  const sql = getSql()
  try {
    const rows = (await sql`
      select
        day::text as day,
        booking_channels,
        packages,
        packages_sold,
        ratings_avg::float as ratings_avg,
        ratings_count,
        payment_mix,
        birthday_count,
        updated_at
      from salon_p2_daily
      where day < ${day}::date
        and (
          case
            when jsonb_typeof(booking_channels) = 'array' then jsonb_array_length(booking_channels) > 0
            when jsonb_typeof(booking_channels) = 'string' then length(booking_channels #>> '{}') > 2
            else false
          end
          or case
            when jsonb_typeof(packages) = 'array' then jsonb_array_length(packages) > 0
            when jsonb_typeof(packages) = 'string' then length(packages #>> '{}') > 2
            else false
          end
          or coalesce(ratings_count, 0) > 0
        )
      order by day desc
      limit 1
    `) as SalonP2Daily[]
    return mapSalonP2Row(rows[0])
  } catch {
    return null
  }
}

export async function upsertSalonP2Daily(
  day: string,
  patch: {
    booking_channels?: P2ChannelRow[]
    packages?: P2PackageRow[]
    packages_sold?: number
    ratings_avg?: number
    ratings_count?: number
    payment_mix?: P2PaymentRow[]
    birthday_count?: number
  },
) {
  await ensureSalonP2Table()
  const sql = getSql()
  const existing = (await sql`
    select * from salon_p2_daily where day = ${day}::date limit 1
  `) as SalonP2Daily[]
  const cur = mapSalonP2Row(existing[0])

  const curChannelsEmpty = jsonArrLen(cur?.booking_channels) === 0
  const curPackagesEmpty = jsonArrLen(cur?.packages) === 0
  const needsPrev =
    (patch.booking_channels === undefined && curChannelsEmpty) ||
    (patch.packages === undefined && curPackagesEmpty) ||
    (patch.ratings_count === undefined && Number(cur?.ratings_count ?? 0) === 0)
  const prev = needsPrev ? await previousCommerceSnapshot(day) : null

  const booking_channels =
    patch.booking_channels ??
    (curChannelsEmpty ? undefined : cur?.booking_channels) ??
    prev?.booking_channels ??
    []
  const packages =
    patch.packages ?? (curPackagesEmpty ? undefined : cur?.packages) ?? prev?.packages ?? []
  const packages_sold =
    patch.packages_sold ??
    (curPackagesEmpty && prev ? Number(prev.packages_sold ?? 0) : Number(cur?.packages_sold ?? 0))
  const ratings_avg =
    patch.ratings_avg ??
    (Number(cur?.ratings_count ?? 0) === 0 && prev
      ? Number(prev.ratings_avg ?? 0)
      : Number(cur?.ratings_avg ?? 0))
  const ratings_count =
    patch.ratings_count ??
    (Number(cur?.ratings_count ?? 0) === 0 && prev
      ? Number(prev.ratings_count ?? 0)
      : Number(cur?.ratings_count ?? 0))
  const payment_mix = patch.payment_mix ?? cur?.payment_mix ?? []
  const birthday_count =
    patch.birthday_count ??
    (Number(cur?.birthday_count ?? 0) === 0 && prev
      ? Number(prev.birthday_count ?? 0)
      : Number(cur?.birthday_count ?? 0))

  await sql`
    insert into salon_p2_daily (
      day, booking_channels, packages, packages_sold,
      ratings_avg, ratings_count, payment_mix, birthday_count, updated_at
    )
    values (
      ${day}::date,
      ${booking_channels},
      ${packages},
      ${packages_sold},
      ${ratings_avg},
      ${ratings_count},
      ${payment_mix},
      ${birthday_count},
      now()
    )
    on conflict (day) do update set
      booking_channels = excluded.booking_channels,
      packages = excluded.packages,
      packages_sold = excluded.packages_sold,
      ratings_avg = excluded.ratings_avg,
      ratings_count = excluded.ratings_count,
      payment_mix = excluded.payment_mix,
      birthday_count = excluded.birthday_count,
      updated_at = now()
  `
}

/** Corrige jsonb legado gravado como string (JSON.stringify + postgres.js). */
export async function repairSalonP2JsonbEncoding(): Promise<number> {
  const sql = getSql()
  const rows = (await sql`
    update salon_p2_daily set
      booking_channels = case
        when jsonb_typeof(booking_channels) = 'string' then (booking_channels #>> '{}')::jsonb
        else booking_channels
      end,
      packages = case
        when jsonb_typeof(packages) = 'string' then (packages #>> '{}')::jsonb
        else packages
      end,
      payment_mix = case
        when jsonb_typeof(payment_mix) = 'string' then (payment_mix #>> '{}')::jsonb
        else payment_mix
      end
    where jsonb_typeof(booking_channels) = 'string'
       or jsonb_typeof(packages) = 'string'
       or jsonb_typeof(payment_mix) = 'string'
    returning day
  `) as { day: string }[]
  return rows.length
}
