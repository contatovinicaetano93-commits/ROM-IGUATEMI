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
 * Sem busca: prioriza quem tem atraso/ação pendente (não corta overdue
 * só porque o contato é antigo e caiu fora do top-N por created_at).
 * Com busca: filtra no servidor por nome/telefone em toda a base.
 * Com status: lista o funil real (ex.: Novo lead / Importado), não só o top urgente.
 */
export async function listContactsWithSummary(
  limitOrOpts: number | ListContactsWithSummaryOpts = 500,
): Promise<ContactListItem[]> {
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
      // Pendentes com status: cruza toda a base de serviços (não só top 2000 recentes).
      const pendingIds = Array.from(byContact.keys())
        .filter((id) => urgencyForServices(byContact.get(id) ?? []).pending_actions > 0)
      if (pendingIds.length === 0) return []
      const contacts = (await sql`
        select * from contacts
        where status = ${status}
          and id = any(${pendingIds}::uuid[])
      `) as ContactRow[]
      const items = withUrgency(contacts, byContact)
      items.sort(compareByOverdueThenName)
      return items.slice(0, limit)
    }
    const contacts = (await sql`
      select * from contacts
      where status = ${status}
      order by created_at desc
      limit ${limit}
    `) as ContactRow[]
    const items = withUrgency(contacts, byContact)
    items.sort(compareByOverdueThenName)
    return items.slice(0, limit)
  }

  if (pendingOnly && !(q || qDigits.length >= 3)) {
    // Filtra pendentes sobre TODA a base de serviços (não só top-N recentes).
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
      .slice(0, limit)

    const ordered = await orderContactsByUrgency(
      pendingRanked.map((x) => x.id),
      byContact,
    )
    return withUrgency(ordered, byContact)
  }

  if (q || qDigits.length >= 3) {
    const namePattern = q ? `%${q}%` : null
    const phonePattern = qDigits.length >= 3 ? `%${qDigits}%` : null
    const contacts = (await sql`
      select * from contacts
      where
        (${status}::text is null or status = ${status})
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
    return pendingOnly ? withU.filter((c) => c.pending_actions > 0) : withU
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
    .slice(0, limit)

  const urgentIds = urgentRanked.map((x) => x.id)
  const orderedUrgent = await orderContactsByUrgency(urgentIds, byContact)

  if (orderedUrgent.length >= limit) {
    return withUrgency(orderedUrgent.slice(0, limit), byContact)
  }

  const remaining = limit - orderedUrgent.length
  const recent =
    urgentIds.length === 0
      ? ((await sql`
          select * from contacts order by created_at desc limit ${remaining}
        `) as ContactRow[])
      : ((await sql`
          select * from contacts
          where not (id = any(${urgentIds}::uuid[]))
          order by created_at desc
          limit ${remaining}
        `) as ContactRow[])

  return withUrgency([...orderedUrgent, ...recent], byContact)
}
