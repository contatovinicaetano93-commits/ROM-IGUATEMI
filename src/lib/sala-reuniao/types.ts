export type MeetingRoomStatus = 'confirmed' | 'cancelled'

export const MEETING_ROOM_KEY = 'sala_reuniao'
export const MEETING_ROOM_LABEL = 'Sala de reunião'

export type MeetingRoomReservation = {
  id: string
  room_key: string
  day: string
  start_time: string
  end_time: string
  title: string | null
  status: MeetingRoomStatus
  created_by_employee_id: string | null
  created_by_name: string
  created_by_role: string
  cancelled_by_name: string | null
  cancelled_at: string | null
  created_at: string
  updated_at: string
}

export type CreateMeetingRoomReservationInput = {
  day: string
  start_time: string
  end_time: string
  title?: string | null
  created_by_employee_id?: string | null
  created_by_name: string
  created_by_role: string
}

export function isIsoDay(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export function isIsoMonth(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}$/.test(value)
}

/** Aceita `HH:MM` ou `HH:MM:SS` → `HH:MM`. */
export function normalizeClockTime(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) {
    return null
  }
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

export function isEndAfterStart(start: string, end: string): boolean {
  return end > start
}

/** Intervalos [start, end) sobrepostos. */
export function rangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return aStart < bEnd && bStart < aEnd
}
