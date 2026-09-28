import 'server-only'

import { getSql } from '@/lib/db'
import type { BrandActivation, CreateBrandActivationInput } from '@/lib/ativacoes/types'
import { normalizeStartTime } from '@/lib/ativacoes/types'

let tableReady: Promise<void> | null = null

export async function ensureBrandActivationsTable() {
  if (!tableReady) {
    tableReady = (async () => {
      const sql = getSql()
      await sql`
        create table if not exists unit_brand_activations (
          id uuid primary key default gen_random_uuid(),
          day date not null,
          start_time time not null,
          brand text not null,
          condition text not null check (condition in ('comercial', 'servicos')),
          notes text,
          status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
          created_by_employee_id uuid,
          created_by_name text not null,
          created_by_role text not null,
          cancelled_by_name text,
          cancelled_at timestamptz,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `
      await sql`
        create unique index if not exists unit_brand_activations_day_confirmed_uidx
          on unit_brand_activations (day)
          where status = 'confirmed'
      `
      await sql`
        create index if not exists unit_brand_activations_day_idx
          on unit_brand_activations (day)
      `
    })().catch((err) => {
      tableReady = null
      throw err
    })
  }
  await tableReady
}

function mapRow(row: Record<string, unknown>): BrandActivation {
  const startRaw = row.start_time
  const start =
    typeof startRaw === 'string'
      ? normalizeStartTime(startRaw.slice(0, 8)) ?? startRaw.slice(0, 5)
      : startRaw instanceof Date
        ? `${String(startRaw.getUTCHours()).padStart(2, '0')}:${String(startRaw.getUTCMinutes()).padStart(2, '0')}`
        : '00:00'
  const dayRaw = row.day
  const day =
    typeof dayRaw === 'string'
      ? dayRaw.slice(0, 10)
      : dayRaw instanceof Date
        ? dayRaw.toISOString().slice(0, 10)
        : String(dayRaw ?? '').slice(0, 10)
  return {
    id: String(row.id),
    day,
    start_time: start,
    brand: String(row.brand ?? ''),
    condition: row.condition === 'servicos' ? 'servicos' : 'comercial',
    notes: typeof row.notes === 'string' ? row.notes : null,
    status: row.status === 'cancelled' ? 'cancelled' : 'confirmed',
    created_by_employee_id:
      typeof row.created_by_employee_id === 'string' ? row.created_by_employee_id : null,
    created_by_name: String(row.created_by_name ?? ''),
    created_by_role: String(row.created_by_role ?? ''),
    cancelled_by_name: typeof row.cancelled_by_name === 'string' ? row.cancelled_by_name : null,
    cancelled_at: typeof row.cancelled_at === 'string' ? row.cancelled_at : null,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

export async function listBrandActivationsForMonth(month: string): Promise<BrandActivation[]> {
  await ensureBrandActivationsTable()
  const sql = getSql()
  const start = `${month}-01`
  const rows = (await sql`
    select
      id::text as id,
      day::text as day,
      start_time::text as start_time,
      brand,
      condition,
      notes,
      status,
      created_by_employee_id::text as created_by_employee_id,
      created_by_name,
      created_by_role,
      cancelled_by_name,
      cancelled_at,
      created_at,
      updated_at
    from unit_brand_activations
    where day >= ${start}::date
      and day < (${start}::date + interval '1 month')
    order by day asc, start_time asc, created_at asc
  `) as Record<string, unknown>[]
  return rows.map(mapRow)
}

export async function getConfirmedActivationForDay(day: string): Promise<BrandActivation | null> {
  await ensureBrandActivationsTable()
  const sql = getSql()
  const rows = (await sql`
    select
      id::text as id,
      day::text as day,
      start_time::text as start_time,
      brand,
      condition,
      notes,
      status,
      created_by_employee_id::text as created_by_employee_id,
      created_by_name,
      created_by_role,
      cancelled_by_name,
      cancelled_at,
      created_at,
      updated_at
    from unit_brand_activations
    where day = ${day}::date
      and status = 'confirmed'
    limit 1
  `) as Record<string, unknown>[]
  return rows[0] ? mapRow(rows[0]) : null
}

export async function getBrandActivationById(id: string): Promise<BrandActivation | null> {
  await ensureBrandActivationsTable()
  const sql = getSql()
  const rows = (await sql`
    select
      id::text as id,
      day::text as day,
      start_time::text as start_time,
      brand,
      condition,
      notes,
      status,
      created_by_employee_id::text as created_by_employee_id,
      created_by_name,
      created_by_role,
      cancelled_by_name,
      cancelled_at,
      created_at,
      updated_at
    from unit_brand_activations
    where id = ${id}::uuid
    limit 1
  `) as Record<string, unknown>[]
  return rows[0] ? mapRow(rows[0]) : null
}

export class DayConflictError extends Error {
  readonly existing: BrandActivation
  constructor(existing: BrandActivation) {
    super('Já existe ativação confirmada neste dia')
    this.name = 'DayConflictError'
    this.existing = existing
  }
}

export async function createBrandActivation(
  input: CreateBrandActivationInput,
): Promise<BrandActivation> {
  await ensureBrandActivationsTable()
  const existing = await getConfirmedActivationForDay(input.day)
  if (existing) throw new DayConflictError(existing)

  const sql = getSql()
  const notes = input.notes?.trim() ? input.notes.trim() : null
  try {
    const rows = (await sql`
      insert into unit_brand_activations (
        day, start_time, brand, condition, notes,
        created_by_employee_id, created_by_name, created_by_role
      ) values (
        ${input.day}::date,
        ${input.start_time}::time,
        ${input.brand.trim()},
        ${input.condition},
        ${notes},
        ${input.created_by_employee_id ?? null}::uuid,
        ${input.created_by_name.trim()},
        ${input.created_by_role}
      )
      returning
        id::text as id,
        day::text as day,
        start_time::text as start_time,
        brand,
        condition,
        notes,
        status,
        created_by_employee_id::text as created_by_employee_id,
        created_by_name,
        created_by_role,
        cancelled_by_name,
        cancelled_at,
        created_at,
        updated_at
    `) as Record<string, unknown>[]
    const row = rows[0]
    if (!row) throw new Error('Falha ao criar ativação')
    return mapRow(row)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (/unit_brand_activations_day_confirmed_uidx|unique/i.test(msg)) {
      const again = await getConfirmedActivationForDay(input.day)
      if (again) throw new DayConflictError(again)
    }
    throw error
  }
}

export async function cancelBrandActivation(
  id: string,
  cancelledByName: string,
): Promise<BrandActivation | null> {
  await ensureBrandActivationsTable()
  const sql = getSql()
  const rows = (await sql`
    update unit_brand_activations
    set
      status = 'cancelled',
      cancelled_by_name = ${cancelledByName.trim()},
      cancelled_at = now(),
      updated_at = now()
    where id = ${id}::uuid
      and status = 'confirmed'
    returning
      id::text as id,
      day::text as day,
      start_time::text as start_time,
      brand,
      condition,
      notes,
      status,
      created_by_employee_id::text as created_by_employee_id,
      created_by_name,
      created_by_role,
      cancelled_by_name,
      cancelled_at,
      created_at,
      updated_at
  `) as Record<string, unknown>[]
  return rows[0] ? mapRow(rows[0]) : null
}
