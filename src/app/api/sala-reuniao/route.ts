import { NextRequest } from 'next/server'
import { err, ok } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { canCancelSalaReuniao, canUseSalaReuniao } from '@/lib/sala-reuniao/access'
import {
  createMeetingRoomReservation,
  listMeetingRoomReservationsForMonth,
  MeetingRoomOverlapError,
} from '@/lib/sala-reuniao/store'
import {
  isEndAfterStart,
  isIsoDay,
  isIsoMonth,
  normalizeClockTime,
} from '@/lib/sala-reuniao/types'

export const maxDuration = 30

function todayMonthBr(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  })
    .format(new Date())
    .slice(0, 7)
}

export async function GET(req: NextRequest) {
  const auth = await requireSession(req)
  if (!auth.ok) return err(auth.message, auth.status)
  if (!canUseSalaReuniao(auth.session)) return err('Acesso restrito à Sala de reunião', 403)

  const monthParam = new URL(req.url).searchParams.get('month')
  const month = isIsoMonth(monthParam) ? monthParam : todayMonthBr()

  try {
    const rows = await listMeetingRoomReservationsForMonth(month)
    const reservations = rows.map((item) => ({
      ...item,
      can_cancel: item.status === 'confirmed' && canCancelSalaReuniao(auth.session, item),
    }))
    return ok({ month, reservations })
  } catch (error) {
    return err(error instanceof Error ? error.message : 'Falha ao listar reservas', 500)
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireSession(req)
  if (!auth.ok) return err(auth.message, auth.status)
  if (!canUseSalaReuniao(auth.session)) return err('Acesso restrito à Sala de reunião', 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return err('Dados inválidos', 400)

  const day = isIsoDay(body.day) ? body.day : null
  const start_time = normalizeClockTime(body.start_time)
  const end_time = normalizeClockTime(body.end_time)
  const title = typeof body.title === 'string' ? body.title.trim() : null

  if (!day || !start_time || !end_time) {
    return err('Informe data, horário de início e horário de fim', 400)
  }
  if (!isEndAfterStart(start_time, end_time)) {
    return err('Horário de fim deve ser depois do início', 400)
  }

  const actorName = auth.session.displayName || auth.session.user
  try {
    const reservation = await createMeetingRoomReservation({
      day,
      start_time,
      end_time,
      title,
      created_by_employee_id: auth.session.employeeId,
      created_by_name: actorName,
      created_by_role: auth.session.role,
    })
    return ok(
      {
        reservation: {
          ...reservation,
          can_cancel: canCancelSalaReuniao(auth.session, reservation),
        },
      },
      undefined,
      201,
    )
  } catch (error) {
    if (error instanceof MeetingRoomOverlapError) {
      return err(error.message, 409)
    }
    return err(error instanceof Error ? error.message : 'Falha ao criar reserva', 500)
  }
}
