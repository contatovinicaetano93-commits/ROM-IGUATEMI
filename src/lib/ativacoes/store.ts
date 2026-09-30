import 'server-only'

import { getSql } from '@/lib/db'
import { getRomPanelId } from '@/lib/brand'
import type {
  AtivacaoUnit,
  BrandActivation,
  CreateBrandActivationInput,
} from '@/lib/ativacoes/types'
import { normalizeClockTime } from '@/lib/ativacoes/types'

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
          end_time time not null,
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
      // v1 → v2: coluna de término + várias confirmadas no mesmo dia
      await sql`alter table unit_brand_activations add column if not exists end_time time`
      await sql`
        update unit_brand_activations
        set end_time = start_time
        where end_time is null
      `
      await sql`alter table unit_brand_activations alter column end_time set not null`
      await sql`drop index if exists unit_brand_activations_day_confirmed_uidx`
      await sql`
        create index if not exists unit_brand_activations_day_idx
          on unit_brand_activations (day)
      `
      await sql`
        create index if not exists unit_brand_activations_day_status_idx
          on unit_brand_activations (day, status)
      `
    })().catch((err) => {
      tableReady = null
      throw err
    })
  }
  await tableReady
}

function clockFromRow(raw: unknown): string {
  if (typeof raw === 'string') {
    return normalizeClockTime(raw.slice(0, 8)) ?? raw.slice(0, 5)
  }
  if (raw instanceof Date) {
    return `${String(raw.getUTCHours()).padStart(2, '0')}:${String(raw.getUTCMinutes()).padStart(2, '0')}`
  }
  return '00:00'
}

function dayFromRow(raw: unknown): string {
  if (typeof raw === 'string') return raw.slice(0, 10)
  if (raw instanceof Date) return raw.toISOString().slice(0, 10)
  return String(raw ?? '').slice(0, 10)
}

export function mapActivationRow(
  row: Record<string, unknown>,
  meta: { unit: AtivacaoUnit; writable: boolean },
): BrandActivation {
  const start = clockFromRow(row.start_time)
  const endRaw = row.end_time
  const end = endRaw == null || endRaw === '' ? start : clockFromRow(endRaw)
  return {
    id: String(row.id),
    day: dayFromRow(row.day),
    start_time: start,
    end_time: end,
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
    unit: meta.unit,
    writable: meta.writable,
  }
}

function localUnit(): AtivacaoUnit {
  return getRomPanelId()
}

export async function listBrandActivationsForMonth(month: string): Promise<BrandActivation[]> {
  await ensureBrandActivationsTable()
  const sql = getSql()
  const start = `${month}-01`
  const unit = localUnit()
  const rows = (await sql`
    select
      id::text as id,
      day::text as day,
      start_time::text as start_time,
      end_time::text as end_time,
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
  return rows.map((row) => mapActivationRow(row, { unit, writable: true }))
}

export async function getBrandActivationById(id: string): Promise<BrandActivation | null> {
  await ensureBrandActivationsTable()
  const sql = getSql()
  const unit = localUnit()
  const rows = (await sql`
    select
      id::text as id,
      day::text as day,
      start_time::text as start_time,
      end_time::text as end_time,
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
  return rows[0] ? mapActivationRow(rows[0], { unit, writable: true }) : null
}

export async function createBrandActivation(
  input: CreateBrandActivationInput,
): Promise<BrandActivation> {
  await ensureBrandActivationsTable()
  const sql = getSql()
  const unit = localUnit()
  const notes = input.notes?.trim() ? input.notes.trim() : null
  const rows = (await sql`
    insert into unit_brand_activations (
      day, start_time, end_time, brand, condition, notes,
      created_by_employee_id, created_by_name, created_by_role
    ) values (
      ${input.day}::date,
      ${input.start_time}::time,
      ${input.end_time}::time,
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
      end_time::text as end_time,
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
  return mapActivationRow(row, { unit, writable: true })
}

export async function cancelBrandActivation(
  id: string,
  cancelledByName: string,
): Promise<BrandActivation | null> {
  await ensureBrandActivationsTable()
  const sql = getSql()
  const unit = localUnit()
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
      end_time::text as end_time,
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
  return rows[0] ? mapActivationRow(rows[0], { unit, writable: true }) : null
}
