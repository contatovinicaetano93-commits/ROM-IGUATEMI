import type { ContactRow } from '@/lib/contacts'
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
    select * from contacts where id in ${ids}
  `) as ContactRow[]
}

/**
 * Lista contatos com resumo de urgência.
 * Sem busca: prioriza quem tem atraso/ação pendente (não corta overdue
 * só porque o contato é antigo e caiu fora do top-N por created_at).
 * Com busca: filtra no servidor por nome/telefone em toda a base.
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

  if (q || qDigits.length >= 3) {
    const namePattern = q ? `%${q}%` : null
    const phonePattern = qDigits.length >= 3 ? `%${qDigits}%` : null
    const contacts = (await sql`
      select * from contacts
      where
        (${namePattern}::text is not null and lower(coalesce(name, '')) like ${namePattern})
        or (
          ${phonePattern}::text is not null
          and regexp_replace(coalesce(phone, ''), '\D', '', 'g') like ${phonePattern}
        )
      order by created_at desc
      limit ${limit}
    `) as ContactRow[]
    return withUrgency(contacts, byContact)
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
  const urgentContacts = await fetchContactsByIds(urgentIds)
  const byId = new Map(urgentContacts.map((c) => [c.id, c]))
  const orderedUrgent = urgentIds
    .map((id) => byId.get(id))
    .filter((c): c is ContactRow => Boolean(c))

  // Reordena com nome real (empate alfabético).
  orderedUrgent.sort((a, b) => {
    const ua = urgencyForServices(byContact.get(a.id) ?? [])
    const ub = urgencyForServices(byContact.get(b.id) ?? [])
    return compareByOverdueThenName(
      { max_overdue_days: ua.max_overdue_days, name: a.name },
      { max_overdue_days: ub.max_overdue_days, name: b.name },
    )
  })

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
