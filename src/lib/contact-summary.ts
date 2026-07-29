import { CONTACT_STATUSES, type ContactRow, type ContactStatus } from '@/lib/contacts'
import { getSql } from '@/lib/db'
import type { ClientService } from '@/lib/services'
import { DUE_SOON_DAYS, SCHEDULED_SOON_DAYS } from '@/lib/salon/constants'
import { compareByOverdueThenName, urgencyForServices } from '@/lib/salon/urgency'

export interface ContactListItem extends ContactRow {
  overdue: number
  max_overdue_days: number
  due_soon: number
  scheduled_soon: number
  pending_actions: number
  urgency_score: number
  top_action: string | null
}

export interface ListContactsWithSummaryOpts {
  limit?: number
  /** Busca server-side por nome (ilike) ou telefone (dígitos). */
  query?: string | null
  /** Só contatos com pending_actions > 0 (calcula sobre urgência de cadência/agenda). */
  pendingOnly?: boolean
  /** Filtro de status do funil (ex.: novo, importado). */
  status?: string | null
  /** Canal (whatsapp/avec/manual/…). */
  channel?: string | null
}

export interface ContactListResult {
  items: ContactListItem[]
  /** Total na base que casa o filtro (antes do limit da página). */
  total: number
}

function withUrgency(
  contacts: ContactRow[],
  byContact: Map<string, ClientService[]>,
): ContactListItem[] {
  return contacts.map((c) => {
    const u = urgencyForServices(byContact.get(c.id) ?? [])
    return {
      ...c,
      overdue: u.overdue,
      max_overdue_days: u.max_overdue_days,
      due_soon: u.due_soon,
      scheduled_soon: u.scheduled_soon,
      pending_actions: u.pending_actions,
      urgency_score: u.urgency_score,
      top_action: u.top_action,
    }
  })
}

async function fetchContactsByIds(ids: string[]): Promise<ContactRow[]> {
  if (ids.length === 0) return []
  const sql = getSql()
  return (await sql`
    select * from contacts
    where id = any(${ids}::uuid[])
      and anonymized_at is null
  `) as ContactRow[]
}

/** Carrega serviços só dos contatos pedidos — evita scan full de client_services. */
async function loadServicesByContactIds(ids: string[]): Promise<Map<string, ClientService[]>> {
  const byContact = new Map<string, ClientService[]>()
  if (ids.length === 0) return byContact
  const sql = getSql()
  const services = (await sql`
    select
      id, contact_id, name, category, product, professional_name, cadence_days,
      last_done_at, last_price, scheduled_at, active, notes, created_at
    from client_services
    where active = true and contact_id = any(${ids}::uuid[])
  `) as ClientService[]
  for (const s of services) {
    const list = byContact.get(s.contact_id) ?? []
    list.push(s)
    byContact.set(s.contact_id, list)
  }
  return byContact
}

function parseStatus(raw: string | null | undefined): ContactStatus | null {
  if (!raw || raw === 'all') return null
  return (CONTACT_STATUSES as readonly string[]).includes(raw) ? (raw as ContactStatus) : null
}

const CONTACT_CHANNELS = ['whatsapp', 'telegram', 'avec', 'instagram', 'manual'] as const

function parseChannel(raw: string | null | undefined): string | null {
  if (!raw || raw === 'all') return null
  return (CONTACT_CHANNELS as readonly string[]).includes(raw) ? raw : null
}

async function orderContactsByUrgency(
  ids: string[],
  byContact: Map<string, ClientService[]>,
): Promise<ContactRow[]> {
  const contacts = await fetchContactsByIds(ids)
  const byId = new Map(contacts.map((c) => [c.id, c]))
  const ordered = ids.map((id) => byId.get(id)).filter((c): c is ContactRow => Boolean(c))
  ordered.sort((a, b) => {
    const ua = urgencyForServices(byContact.get(a.id) ?? [])
    const ub = urgencyForServices(byContact.get(b.id) ?? [])
    return compareByOverdueThenName(
      { max_overdue_days: ua.max_overdue_days, name: a.name },
      { max_overdue_days: ub.max_overdue_days, name: b.name },
    )
  })
  return ordered
}

/**
 * Contatos com sinal de urgência (atraso / vencendo / agendado),
 * ranqueados no SQL — sem carregar a tabela inteira de serviços.
 *
 * Só conta atraso/vencendo com last_done_at real (não inventa visita).
 * Vencendo: janela DUE_SOON_DAYS.
 */
async function rankUrgentContactIds(
  limit: number,
  opts: { channel?: string | null } = {},
): Promise<string[]> {
  const sql = getSql()
  const channel = opts.channel ?? null
  const rows = (await sql`
    with svc as (
      select
        contact_id,
        scheduled_at,
        case
          when cadence_days is null or last_done_at is null then null
          else last_done_at + (cadence_days * interval '1 day')
        end as next_due
      from client_services
      where active = true
    ),
    per_contact as (
      select
        contact_id,
        count(*) filter (where next_due is not null and next_due < now())::int as overdue,
        coalesce(
          max(
            case
              when next_due is not null and next_due < now()
                then ceil(extract(epoch from (now() - next_due)) / 86400.0)
            end
          ),
          0
        )::int as max_overdue_days,
        count(*) filter (
          where next_due is not null
            and next_due >= now()
            and next_due <= now() + (${DUE_SOON_DAYS} * interval '1 day')
        )::int as due_soon,
        count(*) filter (
          where scheduled_at is not null
            and scheduled_at >= now()
            and scheduled_at <= now() + (${SCHEDULED_SOON_DAYS} * interval '1 day')
        )::int as scheduled_soon
      from svc
      group by contact_id
    )
    select pc.contact_id
    from per_contact pc
    join contacts c on c.id = pc.contact_id
    where pc.overdue + pc.due_soon + pc.scheduled_soon > 0
      and c.anonymized_at is null
      and (${channel}::text is null or c.channel = ${channel})
    order by pc.max_overdue_days desc, pc.overdue desc, pc.due_soon desc, pc.scheduled_soon desc
    limit ${limit}
  `) as { contact_id: string }[]
  return rows.map((r) => r.contact_id)
}

/**
 * Lista contatos com resumo de urgência.
 * Evita varrer 40k+ IDs: ranking SQL de urgência; serviços só dos candidatos.
 */
export async function listContactsWithSummary(
  limitOrOpts: number | ListContactsWithSummaryOpts = 100,
): Promise<ContactListResult> {
  const opts: ListContactsWithSummaryOpts =
    typeof limitOrOpts === 'number' ? { limit: limitOrOpts } : limitOrOpts
  const limit = Math.min(Math.max(1, opts.limit ?? 100), 500)
  const rawQuery = (opts.query ?? '').trim()
  const q = rawQuery.toLowerCase()
  const qDigits = rawQuery.replace(/\D/g, '')
  const pendingOnly = opts.pendingOnly === true
  const status = parseStatus(opts.status)
  const channel = parseChannel(opts.channel)
  const sql = getSql()

  // Busca por nome/telefone — SQL limit + serviços só dos hits.
  if (q || qDigits.length >= 3) {
    const namePattern = q ? `%${q}%` : null
    const phonePattern = qDigits.length >= 3 ? `%${qDigits}%` : null
    const countRows = (await sql`
      select count(*)::int as n from contacts
      where anonymized_at is null
        and (${status}::text is null or status = ${status})
        and (${channel}::text is null or channel = ${channel})
        and (
          (${namePattern}::text is not null and lower(coalesce(name, '')) like ${namePattern})
          or (
            ${phonePattern}::text is not null
            and regexp_replace(coalesce(phone, ''), '\\D', '', 'g') like ${phonePattern}
          )
        )
    `) as { n: number }[]
    const total = countRows[0]?.n ?? 0
    const contacts = (await sql`
      select * from contacts
      where anonymized_at is null
        and (${status}::text is null or status = ${status})
        and (${channel}::text is null or channel = ${channel})
        and (
          (${namePattern}::text is not null and lower(coalesce(name, '')) like ${namePattern})
          or (
            ${phonePattern}::text is not null
            and regexp_replace(coalesce(phone, ''), '\\D', '', 'g') like ${phonePattern}
          )
        )
      order by created_at desc
      limit ${limit}
    `) as ContactRow[]
    const byContact = await loadServicesByContactIds(contacts.map((c) => c.id))
    const withU = withUrgency(contacts, byContact)
    if (!pendingOnly) return { items: withU, total }
    const items = withU.filter((c) => c.pending_actions > 0)
    return { items, total: contacts.length < limit ? items.length : total }
  }

  // Filtro de status do funil: página por created_at (não ranqueia 40k importados).
  if (status) {
    const countRows = (await sql`
      select count(*)::int as n from contacts
      where status = ${status}
        and anonymized_at is null
        and (${channel}::text is null or channel = ${channel})
    `) as { n: number }[]
    const total = countRows[0]?.n ?? 0

    if (pendingOnly) {
      const pendingIds = await rankUrgentContactIds(Math.min(limit * 4, 500), { channel })
      if (pendingIds.length === 0) return { items: [], total: 0 }
      const contacts = (await sql`
        select * from contacts
        where status = ${status}
          and anonymized_at is null
          and (${channel}::text is null or channel = ${channel})
          and id = any(${pendingIds}::uuid[])
      `) as ContactRow[]
      const byContact = await loadServicesByContactIds(contacts.map((c) => c.id))
      const items = withUrgency(contacts, byContact)
      items.sort(compareByOverdueThenName)
      return { items: items.slice(0, limit), total: items.length }
    }

    const contacts = (await sql`
      select * from contacts
      where status = ${status}
        and anonymized_at is null
        and (${channel}::text is null or channel = ${channel})
      order by created_at desc
      limit ${limit}
    `) as ContactRow[]
    const byContact = await loadServicesByContactIds(contacts.map((c) => c.id))
    return { items: withUrgency(contacts, byContact), total }
  }

  // Pending: ranking SQL de urgência (atraso / vencendo / agendado).
  if (pendingOnly) {
    const pendingIds = await rankUrgentContactIds(limit, { channel })
    const byContact = await loadServicesByContactIds(pendingIds)
    const ordered = await orderContactsByUrgency(pendingIds, byContact)
    const items = withUrgency(ordered, byContact)
    return { items, total: items.length }
  }

  // Default: urgentes via ranking SQL, depois recentes para completar a página.
  const urgentIds = await rankUrgentContactIds(limit, { channel })
  const byContact = await loadServicesByContactIds(urgentIds)
  const orderedUrgent = await orderContactsByUrgency(urgentIds, byContact)

  let items =
    orderedUrgent.length >= limit
      ? withUrgency(orderedUrgent.slice(0, limit), byContact)
      : withUrgency(orderedUrgent, byContact)

  if (items.length < limit) {
    const remaining = limit - items.length
    const recent =
      urgentIds.length === 0
        ? ((await sql`
            select * from contacts
            where anonymized_at is null
              and (${channel}::text is null or channel = ${channel})
            order by created_at desc
            limit ${remaining}
          `) as ContactRow[])
        : ((await sql`
            select * from contacts
            where anonymized_at is null
              and (${channel}::text is null or channel = ${channel})
              and not (id = any(${urgentIds}::uuid[]))
            order by created_at desc
            limit ${remaining}
          `) as ContactRow[])
    const recentByContact = await loadServicesByContactIds(recent.map((c) => c.id))
    for (const [id, list] of recentByContact) byContact.set(id, list)
    items = [...items, ...withUrgency(recent, byContact)]
  }

  const totalRows = (await sql`
    select count(*)::int as n from contacts
    where anonymized_at is null
      and (${channel}::text is null or channel = ${channel})
  `) as { n: number }[]
  return { items, total: totalRows[0]?.n ?? items.length }
}
