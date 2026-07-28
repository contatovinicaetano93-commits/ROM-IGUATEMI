import { CONTACT_STATUSES, type ContactRow, type ContactStatus } from '@/lib/contacts'
import { getSql } from '@/lib/db'
import type { ClientService } from '@/lib/services'
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
  /** Só contatos com pending_actions > 0. */
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

function mapServices(rows: ClientService[]): Map<string, ClientService[]> {
  const byContact = new Map<string, ClientService[]>()
  for (const s of rows) {
    const list = byContact.get(s.contact_id) ?? []
    list.push(s)
    byContact.set(s.contact_id, list)
  }
  return byContact
}

async function loadActiveServices(contactIds?: string[]): Promise<Map<string, ClientService[]>> {
  const sql = getSql()
  if (contactIds && contactIds.length === 0) return new Map()
  const rows = (
    contactIds
      ? await sql`
          select
            id, contact_id, name, category, product, professional_name, cadence_days,
            last_done_at, last_price, scheduled_at, active, notes, created_at
          from client_services
          where active = true and contact_id = any(${contactIds}::uuid[])
        `
      : await sql`
          select
            id, contact_id, name, category, product, professional_name, cadence_days,
            last_done_at, last_price, scheduled_at, active, notes, created_at
          from client_services
          where active = true
        `
  ) as ClientService[]
  return mapServices(rows)
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
 * Lista contatos com resumo de urgência.
 * Evita varrer 40k+ IDs: paginação SQL primeiro; serviços só dos candidatos.
 */
export async function listContactsWithSummary(
  limitOrOpts: number | ListContactsWithSummaryOpts = 500,
): Promise<ContactListResult> {
  const opts: ListContactsWithSummaryOpts =
    typeof limitOrOpts === 'number' ? { limit: limitOrOpts } : limitOrOpts
  const limit = Math.min(Math.max(1, opts.limit ?? 500), 500)
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
    const byContact = await loadActiveServices(contacts.map((c) => c.id))
    const withU = withUrgency(contacts, byContact)
    if (!pendingOnly) return { items: withU, total }
    const items = withU.filter((c) => c.pending_actions > 0)
    // Página incompleta: todos os matches cabem — total = pendentes desta página.
    if (contacts.length < limit) return { items, total: items.length }
    // Conta pendentes em todos os matches (não só na página SQL).
    const allMatch = (await sql`
      select id from contacts
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
    `) as { id: string }[]
    const allServices = await loadActiveServices(allMatch.map((r) => r.id))
    const pendingTotal = allMatch.filter((r) => {
      const u = urgencyForServices(allServices.get(r.id) ?? [])
      return u.pending_actions > 0
    }).length
    return { items, total: pendingTotal }
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
      const byContact = await loadActiveServices()
      const pendingIds = Array.from(byContact.keys()).filter(
        (id) => urgencyForServices(byContact.get(id) ?? []).pending_actions > 0,
      )
      if (pendingIds.length === 0) return { items: [], total: 0 }
      const contacts = (await sql`
        select * from contacts
        where status = ${status}
          and anonymized_at is null
          and (${channel}::text is null or channel = ${channel})
          and id = any(${pendingIds}::uuid[])
      `) as ContactRow[]
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
    const byContact = await loadActiveServices(contacts.map((c) => c.id))
    return { items: withUrgency(contacts, byContact), total }
  }

  // Default / pending: ranqueia urgência a partir dos serviços ativos (centenas, não dezenas de mil).
  const byContact = await loadActiveServices()

  if (pendingOnly) {
    const pendingRanked = Array.from(byContact.keys())
      .map((id) => {
        const u = urgencyForServices(byContact.get(id) ?? [])
        return { id, u }
      })
      .filter((x) => x.u.pending_actions > 0)
      .sort((a, b) =>
        compareByOverdueThenName(
          { max_overdue_days: a.u.max_overdue_days, name: null },
          { max_overdue_days: b.u.max_overdue_days, name: null },
        ),
      )
    const orderedAll = await orderContactsByUrgency(
      pendingRanked.map((x) => x.id),
      byContact,
    )
    const channelFiltered = channel
      ? orderedAll.filter((c) => c.channel === channel)
      : orderedAll
    return {
      items: withUrgency(channelFiltered.slice(0, limit), byContact),
      total: channelFiltered.length,
    }
  }

  const urgentRanked = Array.from(byContact.keys())
    .map((id) => {
      const u = urgencyForServices(byContact.get(id) ?? [])
      return { id, u }
    })
    .filter((x) => x.u.urgency_score > 0)
    .sort((a, b) =>
      compareByOverdueThenName(
        { max_overdue_days: a.u.max_overdue_days, name: null },
        { max_overdue_days: b.u.max_overdue_days, name: null },
      ),
    )

  const urgentOrdered = await orderContactsByUrgency(
    urgentRanked.map((x) => x.id),
    byContact,
  )
  const urgentChannel = channel
    ? urgentOrdered.filter((c) => c.channel === channel)
    : urgentOrdered
  let items = withUrgency(urgentChannel.slice(0, limit), byContact)

  if (items.length < limit) {
    const exclude = items.map((c) => c.id)
    const recent =
      exclude.length === 0
        ? ((await sql`
            select * from contacts
            where anonymized_at is null
              and (${channel}::text is null or channel = ${channel})
            order by created_at desc
            limit ${limit}
          `) as ContactRow[])
        : ((await sql`
            select * from contacts
            where anonymized_at is null
              and (${channel}::text is null or channel = ${channel})
              and not (id = any(${exclude}::uuid[]))
            order by created_at desc
            limit ${limit - items.length}
          `) as ContactRow[])
    const recentServices = await loadActiveServices(recent.map((c) => c.id))
    for (const [id, list] of recentServices) byContact.set(id, list)
    items = [...items, ...withUrgency(recent, byContact)]
  }

  const totalRows = (await sql`
    select count(*)::int as n from contacts
    where anonymized_at is null
      and (${channel}::text is null or channel = ${channel})
  `) as { n: number }[]
  return { items, total: totalRows[0]?.n ?? items.length }
}
