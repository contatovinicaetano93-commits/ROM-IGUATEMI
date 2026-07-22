import { getSql } from '@/lib/db'
import type { ClientService } from '@/lib/services'
import { listServices } from '@/lib/services'
import { compareByOverdueThenName, urgencyForServices } from '@/lib/salon/urgency'

interface JoinedService extends ClientService {
  contact_name: string | null
  contact_status: string
}

export interface ActionItem {
  contact_id: string
  contact_name: string | null
  contact_status: string
  contact_phone: string | null
  overdue: number
  max_overdue_days: number
  due_soon: number
  scheduled_soon: number
  scheduled_today: number
  urgency_score: number
  recommendations: ReturnType<typeof urgencyForServices>['recommendations']
}

export async function getContactRecommendations(contactId: string) {
  const services = await listServices(contactId)
  return urgencyForServices(services)
}

export async function listActionItems(): Promise<ActionItem[]> {
  const sql = getSql()
  const rows = (await sql`
    select cs.*, c.name as contact_name, c.status as contact_status, c.phone as contact_phone
    from client_services cs
    join contacts c on c.id = cs.contact_id
    where cs.active = true
    order by cs.contact_id
  `) as (JoinedService & { contact_phone: string | null })[]

  const byContact = new Map<string, (JoinedService & { contact_phone: string | null })[]>()
  for (const r of rows) {
    const list = byContact.get(r.contact_id) ?? []
    list.push(r)
    byContact.set(r.contact_id, list)
  }

  return Array.from(byContact.entries())
    .map(([contactId, services]) => {
      const u = urgencyForServices(services)
      return {
        contact_id: contactId,
        contact_name: services[0].contact_name,
        contact_status: services[0].contact_status,
        contact_phone: services[0].contact_phone,
        overdue: u.overdue,
        max_overdue_days: u.max_overdue_days,
        due_soon: u.due_soon,
        scheduled_soon: u.scheduled_soon,
        scheduled_today: u.scheduled_today,
        urgency_score: u.urgency_score,
        recommendations: u.recommendations,
      }
    })
    .filter((i) => i.recommendations.length > 0)
    .sort((a, b) =>
      compareByOverdueThenName(
        { max_overdue_days: a.max_overdue_days, name: a.contact_name },
        { max_overdue_days: b.max_overdue_days, name: b.contact_name },
      ),
    )
}
