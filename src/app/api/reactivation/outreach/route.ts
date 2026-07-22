import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, err, handleError } from '@/lib/api-response'
import { requireAuth } from '@/lib/auth'
import { logReactivationOutreach } from '@/lib/salon/reactivation-kpi'

const schema = z.object({
  contactId: z.string().uuid().optional(),
  phone: z.string().min(8).optional(),
  name: z.string().optional(),
  surface: z.enum(['contact_detail', 'director_0011', 'other']).default('other'),
  lastDoneAtAtSend: z.string().nullable().optional(),
})

/** POST — registra outreach de reativação via WhatsApp (antes de abrir o wa.me). */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const body = schema.parse(await req.json())
    if (!body.contactId && !body.phone) {
      return err('Informe contactId ou phone', 400)
    }

    const result = await logReactivationOutreach({
      contactId: body.contactId,
      phone: body.phone,
      name: body.name,
      surface: body.surface,
      lastDoneAtAtSend: body.lastDoneAtAtSend,
    })
    return ok(result)
  } catch (e) {
    return handleError(e)
  }
}
