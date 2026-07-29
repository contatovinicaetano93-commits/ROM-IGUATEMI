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

export interface ListActionItemsOpts {
  /** Máximo de contatos candidatos (antes do slice do playbook). Default 80. */
  limit?: number
}

export async function getContactRecommendations(contactId: string) {
  const services = await listServices(contactId)
  return urgencyForServices(services)
}

/**
 * Playbook: só carrega serviços de contatos com sinal de urgência (SQL),
 * em vez de scan full de client_services.
 */
export async function listActionItems(opts: ListActionItemsOpts = {}): Promise<ActionItem[]> {
  const limit = Math.min(Math.max(1, opts.limit ?? 80), 500)
  const sql = getSql()

  const candidateIds = (await sql`
    with svc as (
      select
        contact_id,
        scheduled_at,
        case
          when cadence_days is null then null
          else coalesce(last_done_at, created_at) + (cadence_days * interval '1 day')
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
            and next_due <= now() + interval '7 days'
        )::int as due_soon,
        count(*) filter (
          where scheduled_at is not null
            and scheduled_at >= now()
            and scheduled_at <= now() + interval '7 days'
        )::int as scheduled_soon
      from svc
      group by contact_id
    )
    select contact_id
    from per_contact
    where overdue + due_soon + scheduled_soon > 0
    order by max_overdue_days desc, overdue desc, due_soon desc
    limit ${limit}
  `) as { contact_id: string }[]

  if (candidateIds.length === 0) return []

  const ids = candidateIds.map((r) => r.contact_id)
  const rows = (await sql`
    select cs.*, c.name as contact_name, c.status as contact_status, c.phone as contact_phone
    from client_services cs
    join contacts c on c.id = cs.contact_id
    where cs.active = true and cs.contact_id in ${sql(ids)}
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
