import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, err, handleError } from '@/lib/api-response'
import {
  getContactById,
  updateContact,
  logEvent,
  listEvents,
  CONTACT_STATUSES,
  setPreferredManicurist,
  setPreferredHairstylist,
} from '@/lib/contacts'
import { listServices, autoCompleteServicesOnConversion, pickLastVisit } from '@/lib/services'
import { enrichServices, computeRecommendations } from '@/lib/recommendations'
import { isNailService, isHairService } from '@/lib/avec/normalize'

type Ctx = { params: Promise<{ id: string }> }

type ServiceHint = {
  name: string
  professional_name: string | null
  last_done_at: string | null
  scheduled_at: string | null
}

function derivePreferredPro(
  services: ServiceHint[],
  match: (name: string) => boolean
): string | null {
  const hits = services
    .filter((s) => match(s.name) && s.professional_name)
    .sort((a, b) => {
      const ta = a.last_done_at ?? a.scheduled_at ?? ''
      const tb = b.last_done_at ?? b.scheduled_at ?? ''
      return tb.localeCompare(ta)
    })
  return hits[0]?.professional_name ?? null
}

/** SQL NULL = nunca definido (pode auto-preencher). '' = limpo na mão (não re-derivar). */
function isUnsetPreference(value: string | null | undefined) {
  return value == null
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    let contact = await getContactById(id)
    if (!contact) return err('Contato não encontrado', 404)

    const rawServices = await listServices(id)

    if (isUnsetPreference(contact.preferred_manicurist)) {
      const derived = derivePreferredPro(rawServices, isNailService)
      if (derived) {
        await setPreferredManicurist(id, derived)
        contact = { ...contact, preferred_manicurist: derived }
      }
    }
    if (isUnsetPreference(contact.preferred_hairstylist)) {
      const derived = derivePreferredPro(rawServices, isHairService)
      if (derived) {
        await setPreferredHairstylist(id, derived)
        contact = { ...contact, preferred_hairstylist: derived }
      }
    }

    // UI trata '' como “não informada”
    const contactOut = {
      ...contact,
      preferred_manicurist: contact.preferred_manicurist?.trim() || null,
      preferred_hairstylist: contact.preferred_hairstylist?.trim() || null,
    }

    const services = enrichServices(rawServices)
    const recommendations = computeRecommendations(services)
    const events = await listEvents(id)
    const last_visit = pickLastVisit(rawServices)

    return ok({ contact: contactOut, services, recommendations, events, last_visit })
  } catch (e) {
    return handleError(e)
  }
}

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.union([z.string().email(), z.literal('')]).optional(),
  phone: z.string().min(8).optional(),
  status: z.enum(CONTACT_STATUSES).optional(),
  notes: z.string().optional(),
  preferred_manicurist: z.string().nullable().optional(),
  preferred_hairstylist: z.string().nullable().optional(),
})

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const body = patchSchema.parse(await req.json())

    const before = await getContactById(id)
    if (!before) return err('Contato não encontrado', 404)

    const patch = {
      name: body.name,
      email: body.email,
      phone: body.phone,
      status: body.status,
      notes: body.notes,
      ...(body.preferred_manicurist !== undefined
        ? { preferredManicurist: body.preferred_manicurist }
        : {}),
      ...(body.preferred_hairstylist !== undefined
        ? { preferredHairstylist: body.preferred_hairstylist }
        : {}),
    }

    const updated = await updateContact(id, patch)
    if (!updated) return err('Contato não encontrado', 404)

    let autoDone: string[] = []
    if (body.status === 'convertido' && before.status !== 'convertido') {
      autoDone = await autoCompleteServicesOnConversion(id)
    }

    await logEvent({
      contactId: id,
      channel: 'manual',
      direction: 'in',
      handledBy: 'human',
      payload: {
        update: body,
        ...(autoDone.length > 0 ? { conversion_auto_done: autoDone } : {}),
      },
    })

    return ok({
      ...updated,
      preferred_manicurist: updated.preferred_manicurist?.trim() || null,
      preferred_hairstylist: updated.preferred_hairstylist?.trim() || null,
      auto_completed_services: autoDone,
    })
  } catch (e) {
    return handleError(e)
  }
}
