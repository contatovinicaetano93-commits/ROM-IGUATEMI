import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, err, handleError } from '@/lib/api-response'
import { requireAuth } from '@/lib/auth'
import { getContactById, logEvent, updateContact } from '@/lib/contacts'
import { getSql } from '@/lib/db'
import {
  markServiceDone,
  deactivateService,
  scheduleService,
  clearServiceSchedule,
  type ClientService,
} from '@/lib/services'

type Ctx = { params: Promise<{ id: string }> }

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('done') }),
  z.object({ action: z.literal('deactivate') }),
  z.object({ action: z.literal('schedule'), scheduledAt: z.string().datetime() }),
  z.object({ action: z.literal('unschedule') }),
])

async function getServiceById(id: string): Promise<ClientService | null> {
  const sql = getSql()
  const rows = (await sql`
    select * from client_services where id = ${id} limit 1
  `) as ClientService[]
  return rows[0] ?? null
}

// PATCH /api/services/[id] — fluxo guiado de recorrência e agendamento.
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const { id } = await ctx.params
    const body = schema.parse(await req.json())

    const existing = await getServiceById(id)
    if (!existing) return err('Serviço não encontrado', 404)
    const contact = await getContactById(existing.contact_id)
    if (contact?.anonymized_at) return err('Contato anonimizado', 410)

    let service: ClientService | null
    if (body.action === 'done') service = await markServiceDone(id)
    else if (body.action === 'deactivate') service = await deactivateService(id)
    else if (body.action === 'schedule') {
      service = await scheduleService(id, body.scheduledAt)
      if (!service) {
        return err(
          'Não foi possível remarcar: serviço já concluído neste dia (fuso SP).',
          409,
        )
      }
    } else service = await clearServiceSchedule(id)

    if (!service) return err('Serviço não encontrado', 404)

    if (body.action === 'schedule') {
      await updateContact(service.contact_id, { status: 'agendado' })
    } else if (body.action === 'done') {
      await updateContact(service.contact_id, { status: 'convertido' })
    }

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
