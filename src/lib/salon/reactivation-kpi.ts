import { getSql } from '@/lib/db'
import { logEvent, upsertContact } from '@/lib/contacts'

/** Janela padrão de atribuição do KPI Hoje (meio do intervalo 14–30). */
export const REACTIVATION_WINDOW_DAYS = 21

/** Fila Ativados — outreach pelo painel aguardando retorno na Avec. */
export const ACTIVATED_QUEUE_WINDOW_DAYS = 30

export type ReactivationSurface = 'contact_detail' | 'contact_list' | 'director_0011' | 'other'

/** Origem do clique Reativar/Chamar na lista de contatos. */
export type ReactivationListMode = 'reactivate' | 'sem_servicos' | 'novos'

export interface ReactivationKpi {
  window_days: number
  contacted: number
  reactivated: number
  rate: number | null
}

export interface PendingActivationRow {
  contact_id: string
  contacted_at: string
}

/** Outreach que entra na fila Ativados (não inclui Novos nem resposta espontânea WA). */
export function isActivatedOutreachPayload(payload: Record<string, unknown>): boolean {
  const surface = typeof payload.surface === 'string' ? payload.surface : ''
  const listMode = typeof payload.list_mode === 'string' ? payload.list_mode : ''
  if (surface === 'contact_detail') return true
  if (listMode === 'reactivate' || listMode === 'sem_servicos') return true
  // Legado: contact_list antes de list_mode — trata como reativar.
  if (surface === 'contact_list' && !listMode) return true
  return false
}

function clampWindowDays(windowDays: number): number {
  return Math.min(30, Math.max(14, Math.round(windowDays)))
}

export async function logReactivationOutreach(input: {
  contactId?: string | null
  phone?: string | null
  name?: string | null
  surface: ReactivationSurface
  listMode?: ReactivationListMode | null
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
      ...(input.listMode ? { list_mode: input.listMode } : {}),
      last_done_at_at_send: input.lastDoneAtAtSend ?? null,
    },
  })

  return { contactId }
}

/**
 * Contatos com outreach elegível na janela e sem agenda/visita posterior (sync Avec).
 */
export async function countPendingActivatedContacts(
  windowDays = ACTIVATED_QUEUE_WINDOW_DAYS,
): Promise<number> {
  const sql = getSql()
  const days = clampWindowDays(windowDays)
  const rows = (await sql`
    with outreach as (
      select
        ce.contact_id,
        ce.created_at as contacted_at,
        nullif(ce.payload->>'last_done_at_at_send', '')::timestamptz as baseline_done
      from contact_events ce
      join contacts c on c.id = ce.contact_id
      where ce.channel = 'whatsapp'
        and ce.direction = 'out'
        and ce.contact_id is not null
        and c.anonymized_at is null
        and c.status <> 'perdido'
        and ce.created_at >= now() - (${days}::int || ' days')::interval
        and ce.payload->>'kind' = 'reactivation_outreach'
        and (
          ce.payload->>'surface' = 'contact_detail'
          or ce.payload->>'list_mode' in ('reactivate', 'sem_servicos')
          or (
            ce.payload->>'surface' = 'contact_list'
            and coalesce(ce.payload->>'list_mode', '') = ''
          )
        )
    ),
    distinct_contacts as (
      select distinct on (contact_id) contact_id, contacted_at, baseline_done
      from outreach
      order by contact_id, contacted_at desc
    )
    select count(*)::int as n
    from distinct_contacts d
    where not exists (
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
    )
  `) as { n: number }[]
  return Number(rows[0]?.n ?? 0) || 0
}

/** Lista fila Ativados — mais recente outreach primeiro. */
export async function listPendingActivatedContacts(
  opts: { windowDays?: number; limit?: number } = {},
): Promise<PendingActivationRow[]> {
  const sql = getSql()
  const days = clampWindowDays(opts.windowDays ?? ACTIVATED_QUEUE_WINDOW_DAYS)
  const limit = Math.min(Math.max(1, opts.limit ?? 250), 500)
  return (await sql`
    with outreach as (
      select
        ce.contact_id,
        ce.created_at as contacted_at,
        nullif(ce.payload->>'last_done_at_at_send', '')::timestamptz as baseline_done
      from contact_events ce
      join contacts c on c.id = ce.contact_id
      where ce.channel = 'whatsapp'
        and ce.direction = 'out'
        and ce.contact_id is not null
        and c.anonymized_at is null
        and c.status <> 'perdido'
        and ce.created_at >= now() - (${days}::int || ' days')::interval
        and ce.payload->>'kind' = 'reactivation_outreach'
        and (
          ce.payload->>'surface' = 'contact_detail'
          or ce.payload->>'list_mode' in ('reactivate', 'sem_servicos')
          or (
            ce.payload->>'surface' = 'contact_list'
            and coalesce(ce.payload->>'list_mode', '') = ''
          )
        )
    ),
    distinct_contacts as (
      select distinct on (contact_id) contact_id, contacted_at, baseline_done
      from outreach
      order by contact_id, contacted_at desc
    )
    select d.contact_id, d.contacted_at
    from distinct_contacts d
    where not exists (
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
    )
    order by d.contacted_at desc
    limit ${limit}
  `) as PendingActivationRow[]
}

/**
 * Contatados via WA de reativação na janela; reativados = agendaram ou
 * realizaram serviço depois do outreach (dentro da mesma janela).
 */
export async function getReactivationKpis(
  windowDays = REACTIVATION_WINDOW_DAYS,
): Promise<ReactivationKpi> {
  const sql = getSql()
  const days = clampWindowDays(windowDays)

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
