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
  /** Só contatos com pending_actions > 0 (calcula sobre toda a base de serviços). */
  pendingOnly?: boolean
  /** Filtro de status do funil (ex.: novo, importado) — server-side, não só no top urgente. */
  status?: string | null
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
  // Neon: `IN ${array}` vira SQL inválido — usar ANY(uuid[]), igual ao restante do arquivo.
  return (await sql`
    select * from contacts where id = any(${ids}::uuid[])
  `) as ContactRow[]
}

function parseStatus(raw: string | null | undefined): ContactStatus | null {
  if (!raw || raw === 'all') return null
  return (CONTACT_STATUSES as readonly string[]).includes(raw) ? (raw as ContactStatus) : null
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
 * Com status: funil real (Novo lead / Importado) na base inteira + total.
 * Sem busca: prioriza atraso/pendente; completa com recentes até o limit.
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

  const sql = getSql()

  const services = (await sql`
    select * from client_services where active = true
  `) as ClientService[]

  const byContact = new Map<string, ClientService[]>()
  for (const s of services) {
    const list = byContact.get(s.contact_id) ?? []
    list.push(s)
    byContact.set(s.contact_id, list)
  }

  // Status do funil (Novo lead / Importado / …): busca na base, não no top urgente.
  if (status && !(q || qDigits.length >= 3)) {
    if (pendingOnly) {
      const pendingIds = Array.from(byContact.keys()).filter(
        (id) => urgencyForServices(byContact.get(id) ?? []).pending_actions > 0,
      )
      if (pendingIds.length === 0) return { items: [], total: 0 }
      const contacts = (await sql`
        select * from contacts
        where status = ${status}
          and anonymized_at is null
          and id = any(${pendingIds}::uuid[])
      `) as ContactRow[]
      const items = withUrgency(contacts, byContact)
      items.sort(compareByOverdueThenName)
      return { items: items.slice(0, limit), total: items.length }
    }
    const idRows = (await sql`
      select id, name from contacts
      where status = ${status}
        and anonymized_at is null
    `) as { id: string; name: string | null }[]
    const total = idRows.length
    const ranked = idRows
      .map((r) => {
        const u = urgencyForServices(byContact.get(r.id) ?? [])
        return { id: r.id, name: r.name, max_overdue_days: u.max_overdue_days }
      })
      .sort(compareByOverdueThenName)
      .slice(0, limit)
    if (ranked.length === 0) return { items: [], total }
    const ordered = await orderContactsByUrgency(
      ranked.map((r) => r.id),
      byContact,
    )
    return { items: withUrgency(ordered, byContact), total }
  }

  if (pendingOnly && !(q || qDigits.length >= 3)) {
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
    const total = pendingRanked.length
    const ordered = await orderContactsByUrgency(
      pendingRanked.slice(0, limit).map((x) => x.id),
      byContact,
    )
    return { items: withUrgency(ordered, byContact), total }
  }

  if (q || qDigits.length >= 3) {
    const namePattern = q ? `%${q}%` : null
    const phonePattern = qDigits.length >= 3 ? `%${qDigits}%` : null
    const contacts = (await sql`
      select * from contacts
      where anonymized_at is null
        and (${status}::text is null or status = ${status})
        and (
          (${namePattern}::text is not null and lower(coalesce(name, '')) like ${namePattern})
          or (
            ${phonePattern}::text is not null
            and regexp_replace(coalesce(phone, ''), '\D', '', 'g') like ${phonePattern}
          )
        )
      order by created_at desc
      limit ${limit}
    `) as ContactRow[]
    const withU = withUrgency(contacts, byContact)
    const items = pendingOnly ? withU.filter((c) => c.pending_actions > 0) : withU
    return { items, total: items.length }
  }

  // Contatos com urgência > 0 (atraso / vencendo / agendado) — prioridade.
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

  const urgentIds = urgentRanked.slice(0, limit).map((x) => x.id)
  const orderedUrgent = await orderContactsByUrgency(urgentIds, byContact)
  let items = withUrgency(orderedUrgent, byContact)

  if (items.length < limit) {
    const exclude = items.map((c) => c.id)
    const recent =
      exclude.length === 0
        ? ((await sql`
            select * from contacts
            where anonymized_at is null
            order by created_at desc
            limit ${limit}
          `) as ContactRow[])
        : ((await sql`
            select * from contacts
            where anonymized_at is null
              and not (id = any(${exclude}::uuid[]))
            order by created_at desc
            limit ${limit - items.length}
          `) as ContactRow[])
    items = [...items, ...withUrgency(recent, byContact)]
  }

  const totalRows = (await sql`
    select count(*)::int as n from contacts where anonymized_at is null
  `) as { n: number }[]
  return { items, total: totalRows[0]?.n ?? items.length }
}
