import { NextRequest } from 'next/server'
import { err, ok } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { canCancelSalaReuniao, canUseSalaReuniao } from '@/lib/sala-reuniao/access'
import {
  cancelMeetingRoomReservation,
  getMeetingRoomReservationById,
} from '@/lib/sala-reuniao/store'

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireSession(req)
  if (!auth.ok) return err(auth.message, auth.status)
  if (!canUseSalaReuniao(auth.session)) return err('Acesso restrito à Sala de reunião', 403)

  const { id } = await ctx.params
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return err('Id inválido', 400)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return err('Dados inválidos', 400)
  if (body.status !== 'cancelled') {
    return err('Só é possível cancelar (status: cancelled)', 400)
  }

  const actorName = auth.session.displayName || auth.session.user
  try {
    const before = await getMeetingRoomReservationById(id)
    if (!before) return err('Reserva não encontrada', 404)
    if (before.status === 'cancelled') {
      return ok({ reservation: { ...before, can_cancel: false } })
    }
    if (!canCancelSalaReuniao(auth.session, before)) {
      return err('Só quem reservou (ou admin) pode cancelar', 403)
    }

    const reservation = await cancelMeetingRoomReservation(id, actorName)
    if (!reservation) return err('Reserva não encontrada ou já cancelada', 404)

    return ok({ reservation: { ...reservation, can_cancel: false } })
  } catch (error) {
    return err(error instanceof Error ? error.message : 'Falha ao cancelar reserva', 500)
  }
}
