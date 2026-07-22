import type { ContactRow } from '@/lib/contacts'
import { getSql } from '@/lib/db'
import type { ClientService } from '@/lib/services'
import { urgencyForServices } from '@/lib/salon/urgency'

export interface ContactListItem extends ContactRow {
  overdue: number
  max_overdue_days: number
  due_soon: number
  scheduled_soon: number
  pending_actions: number
  urgency_score: number
  top_action: string | null
}

export async function listContactsWithSummary(limit = 500): Promise<ContactListItem[]> {
  const sql = getSql()
  const contacts = (await sql`
    select * from contacts order by created_at desc limit ${limit}
  `) as ContactRow[]

  if (contacts.length === 0) return []

  const services = (await sql`
    select * from client_services where active = true
  `) as ClientService[]

  const byContact = new Map<string, ClientService[]>()
  for (const s of services) {
    const list = byContact.get(s.contact_id) ?? []
    list.push(s)
    byContact.set(s.contact_id, list)
  }

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
