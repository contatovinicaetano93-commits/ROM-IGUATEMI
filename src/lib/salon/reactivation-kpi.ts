import { getSql } from '@/lib/db'
import { logEvent, upsertContact } from '@/lib/contacts'

/** Janela padrão de atribuição (meio do intervalo 14–30 combinado). */
export const REACTIVATION_WINDOW_DAYS = 21

export type ReactivationSurface = 'contact_detail' | 'director_0011' | 'other'

export interface ReactivationKpi {
  window_days: number
  contacted: number
  reactivated: number
  rate: number | null
}

export async function logReactivationOutreach(input: {
  contactId?: string | null
  phone?: string | null
  name?: string | null
  surface: ReactivationSurface
  lastDoneAtAtSend?: string | null
}): Promise<{ contactId: string }> {
  let contactId = input.contactId ?? null
  if (!contactId) {
    if (!input.phone) throw new Error('contactId ou phone é obrigatório')
    const contact = await upsertContact({
      phone: input.phone,
      name: input.name ?? null,
      channel: 'whatsapp',
      source: 'reactivation_outreach',
    })
    contactId = contact.id
  }

  await logEvent({
    contactId,
    channel: 'whatsapp',
    direction: 'out',
    handledBy: 'human',
    payload: {
      kind: 'reactivation_outreach',
      surface: input.surface,
      last_done_at_at_send: input.lastDoneAtAtSend ?? null,
    },
  })

  return { contactId }
}

/**
 * Contatados via WA de reativação na janela; reativados = agendaram ou
 * realizaram serviço depois do outreach (dentro da mesma janela).
 */
export async function getReactivationKpis(
  windowDays = REACTIVATION_WINDOW_DAYS,
): Promise<ReactivationKpi> {
  const sql = getSql()
  const days = Math.min(30, Math.max(14, Math.round(windowDays)))

  const rows = (await sql`
    with outreach as (
      select
        ce.contact_id,
        ce.created_at as contacted_at,
        nullif(ce.payload->>'last_done_at_at_send', '')::timestamptz as baseline_done
      from contact_events ce
      where ce.channel = 'whatsapp'
        and ce.direction = 'out'
        and ce.payload->>'kind' = 'reactivation_outreach'
        and ce.contact_id is not null
        and ce.created_at >= now() - (${days}::int || ' days')::interval
    ),
    distinct_contacts as (
      select distinct on (contact_id) contact_id, contacted_at, baseline_done
      from outreach
      order by contact_id, contacted_at desc
    ),
    scored as (
      select
        d.contact_id,
        exists (
          select 1
          from client_services cs
          where cs.contact_id = d.contact_id
            and cs.active = true
            and (
              (cs.scheduled_at is not null and cs.scheduled_at > d.contacted_at)
              or (
                cs.last_done_at is not null
                and cs.last_done_at > d.contacted_at
                and (
                  d.baseline_done is null
                  or cs.last_done_at > d.baseline_done
                )
              )
            )
        ) as reactivated
      from distinct_contacts d
    )
    select
      count(*)::int as contacted,
      count(*) filter (where reactivated)::int as reactivated
    from scored
  `) as { contacted: number; reactivated: number }[]

  const contacted = rows[0]?.contacted ?? 0
  const reactivated = rows[0]?.reactivated ?? 0
  return {
    window_days: days,
    contacted,
    reactivated,
    rate: contacted > 0 ? Math.round((reactivated / contacted) * 1000) / 10 : null,
  }
}
