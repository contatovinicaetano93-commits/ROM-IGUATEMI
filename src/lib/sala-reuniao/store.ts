import 'server-only'

import { getSql } from '@/lib/db'
import {
  MEETING_ROOM_KEY,
  normalizeClockTime,
  rangesOverlap,
  type CreateMeetingRoomReservationInput,
  type MeetingRoomReservation,
} from '@/lib/sala-reuniao/types'

let tableReady: Promise<void> | null = null

export async function ensureMeetingRoomReservationsTable() {
  if (!tableReady) {
    tableReady = (async () => {
      const sql = getSql()
      await sql`
        create table if not exists meeting_room_reservations (
          id uuid primary key default gen_random_uuid(),
          room_key text not null default 'sala_reuniao',
          day date not null,
          start_time time not null,
          end_time time not null,
          title text,
          status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
          created_by_employee_id uuid,
          created_by_name text not null,
          created_by_role text not null,
          cancelled_by_name text,
          cancelled_at timestamptz,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          check (end_time > start_time)
        )
      `
      await sql`
        create index if not exists meeting_room_reservations_day_status_idx
          on meeting_room_reservations (day, status)
      `
      await sql`
        create index if not exists meeting_room_reservations_day_room_idx
          on meeting_room_reservations (room_key, day, status)
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

export function mapMeetingRoomRow(row: Record<string, unknown>): MeetingRoomReservation {
  return {
    id: String(row.id),
    room_key: String(row.room_key ?? MEETING_ROOM_KEY),
    day: dayFromRow(row.day),
    start_time: clockFromRow(row.start_time),
    end_time: clockFromRow(row.end_time),
    title: typeof row.title === 'string' && row.title.trim() ? row.title.trim() : null,
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

function isMissingRelation(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  return /relation .*meeting_room_reservations.* does not exist|42P01/i.test(msg)
}

async function selectMonthRows(month: string): Promise<Record<string, unknown>[]> {
  const sql = getSql()
  const start = `${month}-01`
  return (await sql`
    select
      id::text as id,
      room_key,
      day::text as day,
      start_time::text as start_time,
      end_time::text as end_time,
      title,
      status,
      created_by_employee_id::text as created_by_employee_id,
      created_by_name,
      created_by_role,
      cancelled_by_name,
      cancelled_at,
      created_at,
      updated_at
    from meeting_room_reservations
    where room_key = ${MEETING_ROOM_KEY}
      and day >= ${start}::date
      and day < (${start}::date + interval '1 month')
    order by day asc, start_time asc, created_at asc
  `) as Record<string, unknown>[]
}

/** Lista do mês — SELECT direto; DDL só se a tabela ainda não existir. */
export async function listMeetingRoomReservationsForMonth(
  month: string,
): Promise<MeetingRoomReservation[]> {
  try {
    const rows = await selectMonthRows(month)
    return rows.map(mapMeetingRoomRow)
  } catch (error) {
    if (!isMissingRelation(error)) throw error
    await ensureMeetingRoomReservationsTable()
    const rows = await selectMonthRows(month)
    return rows.map(mapMeetingRoomRow)
  }
}

export async function getMeetingRoomReservationById(
  id: string,
): Promise<MeetingRoomReservation | null> {
  await ensureMeetingRoomReservationsTable()
  const sql = getSql()
  const rows = (await sql`
    select
      id::text as id,
      room_key,
      day::text as day,
      start_time::text as start_time,
      end_time::text as end_time,
      title,
      status,
      created_by_employee_id::text as created_by_employee_id,
      created_by_name,
      created_by_role,
      cancelled_by_name,
      cancelled_at,
      created_at,
      updated_at
    from meeting_room_reservations
    where id = ${id}::uuid
    limit 1
  `) as Record<string, unknown>[]
  return rows[0] ? mapMeetingRoomRow(rows[0]) : null
}

export async function listConfirmedForDay(day: string): Promise<MeetingRoomReservation[]> {
  await ensureMeetingRoomReservationsTable()
  const sql = getSql()
  const rows = (await sql`
    select
      id::text as id,
      room_key,
      day::text as day,
      start_time::text as start_time,
      end_time::text as end_time,
      title,
      status,
      created_by_employee_id::text as created_by_employee_id,
      created_by_name,
      created_by_role,
      cancelled_by_name,
      cancelled_at,
      created_at,
      updated_at
    from meeting_room_reservations
    where room_key = ${MEETING_ROOM_KEY}
      and day = ${day}::date
      and status = 'confirmed'
    order by start_time asc
  `) as Record<string, unknown>[]
  return rows.map(mapMeetingRoomRow)
}

export class MeetingRoomOverlapError extends Error {
  constructor(message = 'Horário já reservado neste dia') {
    super(message)
    this.name = 'MeetingRoomOverlapError'
  }
}

export async function createMeetingRoomReservation(
  input: CreateMeetingRoomReservationInput,
): Promise<MeetingRoomReservation> {
  await ensureMeetingRoomReservationsTable()
  const existing = await listConfirmedForDay(input.day)
  for (const row of existing) {
    if (rangesOverlap(input.start_time, input.end_time, row.start_time, row.end_time)) {
      throw new MeetingRoomOverlapError(
        `Conflito com ${row.start_time}–${row.end_time}${row.title ? ` (${row.title})` : ''} · ${row.created_by_name}`,
      )
    }
  }

  const sql = getSql()
  const title = input.title?.trim() ? input.title.trim() : null
  const rows = (await sql`
    insert into meeting_room_reservations (
      room_key, day, start_time, end_time, title,
      created_by_employee_id, created_by_name, created_by_role
    ) values (
      ${MEETING_ROOM_KEY},
      ${input.day}::date,
      ${input.start_time}::time,
      ${input.end_time}::time,
      ${title},
      ${input.created_by_employee_id ?? null}::uuid,
      ${input.created_by_name.trim()},
      ${input.created_by_role}
    )
    returning
      id::text as id,
      room_key,
      day::text as day,
      start_time::text as start_time,
      end_time::text as end_time,
      title,
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
  if (!row) throw new Error('Falha ao criar reserva')
  return mapMeetingRoomRow(row)
}

export async function cancelMeetingRoomReservation(
  id: string,
  cancelledByName: string,
): Promise<MeetingRoomReservation | null> {
  await ensureMeetingRoomReservationsTable()
  const sql = getSql()
  const rows = (await sql`
    update meeting_room_reservations
    set
      status = 'cancelled',
      cancelled_by_name = ${cancelledByName.trim()},
      cancelled_at = now(),
      updated_at = now()
    where id = ${id}::uuid
      and status = 'confirmed'
    returning
      id::text as id,
      room_key,
      day::text as day,
      start_time::text as start_time,
      end_time::text as end_time,
      title,
      status,
      created_by_employee_id::text as created_by_employee_id,
      created_by_name,
      created_by_role,
      cancelled_by_name,
      cancelled_at,
      created_at,
      updated_at
  `) as Record<string, unknown>[]
  return rows[0] ? mapMeetingRoomRow(rows[0]) : null
}
