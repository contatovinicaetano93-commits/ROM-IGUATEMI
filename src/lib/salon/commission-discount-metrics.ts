import { getSql } from '@/lib/db'
import { asJsonArray } from '@/lib/jsonb'
import type { NormalizedCommissionDiscountLine } from '@/lib/avec/normalize'

/** Snapshot 0029 por profissional/dia — espelho Avec (não recalcula). */
export type CommissionDiscountLine = NormalizedCommissionDiscountLine

export type SalonCommissionDiscountsDaily = {
  day: string
  avec_pro_id: string
  lines: CommissionDiscountLine[]
  updated_at: string
}

let discountsTableReady: Promise<void> | null = null

export async function ensureSalonCommissionDiscountsTable() {
  if (!discountsTableReady) {
    discountsTableReady = (async () => {
      const sql = getSql()
      await sql`
        create table if not exists salon_commission_discounts_daily (
          day date not null,
          avec_pro_id text not null,
          lines jsonb not null default '[]',
          updated_at timestamptz not null default now(),
          primary key (day, avec_pro_id)
        )
      `
    })().catch((err) => {
      discountsTableReady = null
      throw err
    })
  }
  await discountsTableReady
}

export async function upsertSalonCommissionDiscountsDaily(
  day: string,
  avecProId: string,
  lines: CommissionDiscountLine[],
) {
  await ensureSalonCommissionDiscountsTable()
  const sql = getSql()
  await sql`
    insert into salon_commission_discounts_daily (day, avec_pro_id, lines, updated_at)
    values (${day}::date, ${avecProId}, ${lines}, now())
    on conflict (day, avec_pro_id) do update set
      lines = excluded.lines,
      updated_at = now()
  `
}

function mapRow(
  row: SalonCommissionDiscountsDaily | null | undefined,
): SalonCommissionDiscountsDaily | null {
  if (!row) return null
  return {
    ...row,
    lines: asJsonArray<CommissionDiscountLine>(row.lines),
  }
}

export async function getSalonCommissionDiscountsDaily(
  day: string,
  avecProId: string,
): Promise<SalonCommissionDiscountsDaily | null> {
  const sql = getSql()
  try {
    const rows = (await sql`
      select day::text as day, avec_pro_id, lines, updated_at
      from salon_commission_discounts_daily
      where day = ${day}::date and avec_pro_id = ${avecProId}
      limit 1
    `) as SalonCommissionDiscountsDaily[]
    return mapRow(rows[0])
  } catch {
    return null
  }
}

/**
 * Snapshot 0029 mais recente em ou antes de targetDay para o profissional.
 */
export async function getSalonCommissionDiscountsDailyNear(
  targetDay: string,
  avecProId: string,
  opts?: { maxSkewDays?: number },
): Promise<SalonCommissionDiscountsDaily | null> {
  const sql = getSql()
  try {
    const rows = (await sql`
      select day::text as day, avec_pro_id, lines, updated_at
      from salon_commission_discounts_daily
      where day <= ${targetDay}::date and avec_pro_id = ${avecProId}
      order by day desc
      limit 1
    `) as SalonCommissionDiscountsDaily[]
    const mapped = mapRow(rows[0])
    if (!mapped || opts?.maxSkewDays == null) return mapped
    const minDay = addDaysIso(targetDay, -Math.max(0, Math.floor(opts.maxSkewDays)))
    return mapped.day >= minDay ? mapped : null
  } catch {
    return null
  }
}

function addDaysIso(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}
