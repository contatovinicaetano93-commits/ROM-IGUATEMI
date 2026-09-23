import { getSql } from '@/lib/db'
import { asJsonArray } from '@/lib/jsonb'
import type { NormalizedCommissionRow } from '@/lib/avec/normalize'

/** Snapshot 8123 por profissional — espelho Avec (não recalcula %). */
export type CommissionProfessionalRow = NormalizedCommissionRow

export type SalonCommissionsDaily = {
  day: string
  professionals: CommissionProfessionalRow[]
  updated_at: string
}

let commissionsTableReady: Promise<void> | null = null

export async function ensureSalonCommissionsTable() {
  if (!commissionsTableReady) {
    commissionsTableReady = (async () => {
      const sql = getSql()
      await sql`
        create table if not exists salon_commissions_daily (
          day date primary key,
          professionals jsonb not null default '[]',
          updated_at timestamptz not null default now()
        )
      `
    })().catch((err) => {
      commissionsTableReady = null
      throw err
    })
  }
  await commissionsTableReady
}

export async function upsertSalonCommissionsDaily(
  day: string,
  professionals: CommissionProfessionalRow[],
) {
  await ensureSalonCommissionsTable()
  const sql = getSql()
  await sql`
    insert into salon_commissions_daily (day, professionals, updated_at)
    values (${day}::date, ${professionals}, now())
    on conflict (day) do update set
      professionals = excluded.professionals,
      updated_at = now()
  `
}

function mapRow(row: SalonCommissionsDaily | null | undefined): SalonCommissionsDaily | null {
  if (!row) return null
  return {
    ...row,
    professionals: asJsonArray<CommissionProfessionalRow>(row.professionals),
  }
}

export async function getSalonCommissionsDaily(day: string): Promise<SalonCommissionsDaily | null> {
  const sql = getSql()
  try {
    const rows = (await sql`
      select day::text as day, professionals, updated_at
      from salon_commissions_daily
      where day = ${day}::date
      limit 1
    `) as SalonCommissionsDaily[]
    return mapRow(rows[0])
  } catch {
    return null
  }
}

/**
 * Snapshot 8123 mais recente em ou antes de targetDay (mesmo padrão P1 MTD).
 */
export async function getSalonCommissionsDailyNear(
  targetDay: string,
  opts?: { maxSkewDays?: number },
): Promise<SalonCommissionsDaily | null> {
  const sql = getSql()
  try {
    const rows = (await sql`
      select day::text as day, professionals, updated_at
      from salon_commissions_daily
      where day <= ${targetDay}::date
      order by day desc
      limit 1
    `) as SalonCommissionsDaily[]
    const mapped = mapRow(rows[0])
    if (!mapped || opts?.maxSkewDays == null) return mapped
    const minDay = addDaysIso(targetDay, -Math.max(0, Math.floor(opts.maxSkewDays)))
    return mapped.day >= minDay ? mapped : null
  } catch {
    return null
  }
}

export async function getLatestSalonCommissionsDaily(): Promise<SalonCommissionsDaily | null> {
  const sql = getSql()
  try {
    const rows = (await sql`
      select day::text as day, professionals, updated_at
      from salon_commissions_daily
      order by day desc
      limit 1
    `) as SalonCommissionsDaily[]
    return mapRow(rows[0])
  } catch {
    return null
  }
}

function addDaysIso(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}
