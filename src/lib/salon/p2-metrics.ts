import { getSql } from '@/lib/db'

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

export async function ensureSalonP2Table() {
  const sql = getSql()
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
  const cur = existing[0]

  const booking_channels =
    patch.booking_channels ?? (cur?.booking_channels as P2ChannelRow[] | undefined) ?? []
  const packages = patch.packages ?? (cur?.packages as P2PackageRow[] | undefined) ?? []
  const packages_sold = patch.packages_sold ?? Number(cur?.packages_sold ?? 0)
  const ratings_avg = patch.ratings_avg ?? Number(cur?.ratings_avg ?? 0)
  const ratings_count = patch.ratings_count ?? Number(cur?.ratings_count ?? 0)
  const payment_mix = patch.payment_mix ?? (cur?.payment_mix as P2PaymentRow[] | undefined) ?? []
  const birthday_count = patch.birthday_count ?? Number(cur?.birthday_count ?? 0)

  await sql`
    insert into salon_p2_daily (
      day, booking_channels, packages, packages_sold,
      ratings_avg, ratings_count, payment_mix, birthday_count, updated_at
    )
    values (
      ${day}::date,
      ${JSON.stringify(booking_channels)}::jsonb,
      ${JSON.stringify(packages)}::jsonb,
      ${packages_sold},
      ${ratings_avg},
      ${ratings_count},
      ${JSON.stringify(payment_mix)}::jsonb,
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
