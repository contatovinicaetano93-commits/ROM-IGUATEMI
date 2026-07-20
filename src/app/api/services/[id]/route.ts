import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, err, handleError } from '@/lib/api-response'
import { requireAuth } from '@/lib/auth'
import { logEvent } from '@/lib/contacts'
import {
  markServiceDone,
  deactivateService,
  scheduleService,
  clearServiceSchedule,
} from '@/lib/services'

type Ctx = { params: Promise<{ id: string }> }

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('done') }),
  z.object({ action: z.literal('deactivate') }),
  z.object({ action: z.literal('schedule'), scheduledAt: z.string().datetime() }),
  z.object({ action: z.literal('unschedule') }),
])

// PATCH /api/services/[id] — fluxo guiado de recorrência e agendamento.
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const { id } = await ctx.params
    const body = schema.parse(await req.json())

    let service
    if (body.action === 'done') service = await markServiceDone(id)
    else if (body.action === 'deactivate') service = await deactivateService(id)
    else if (body.action === 'schedule') service = await scheduleService(id, body.scheduledAt)
    else service = await clearServiceSchedule(id)

    if (!service) return err('Serviço não encontrado', 404)

    await logEvent({
      contactId: service.contact_id,
      channel: 'manual',
      direction: 'in',
      handledBy: 'human',
      payload:
        body.action === 'schedule'
          ? { service_scheduled: service.name, scheduled_at: body.scheduledAt }
          : body.action === 'unschedule'
            ? { service_unscheduled: service.name }
            : body.action === 'done'
              ? { service_done: service.name }
              : { service_deactivated: service.name },
    })

    return ok(service)
  } catch (e) {
    return handleError(e)
  }
}
