import { getSql } from '@/lib/db'
import { enrichServices } from '@/lib/recommendations'

export const SERVICE_CATEGORIES = ['corte', 'tratamento', 'coloracao', 'bem_estar', 'produto', 'outro'] as const
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number]

export interface ClientService {
  id: string
  contact_id: string
  name: string
  category: string
  cadence_days: number | null
  last_done_at: string | null
  scheduled_at: string | null
  product: string | null
  notes: string | null
  professional_name: string | null
  last_price: number | null
  active: boolean
  created_at: string
}

export interface ScheduledServiceRow extends ClientService {
  contact_name: string | null
}

/** Última visita do cliente — serviço com last_done_at mais recente. */
export interface LastVisit {
  service_id: string
  service_name: string
  last_done_at: string
  professional_name: string | null
  last_price: number | null
}

export async function listServices(contactId: string): Promise<ClientService[]> {
  const sql = getSql()
  return (await sql`
    select * from client_services
    where contact_id = ${contactId} and active = true
    order by created_at asc
  `) as ClientService[]
}

export function pickLastVisit(services: ClientService[]): LastVisit | null {
  let best: ClientService | null = null
  for (const s of services) {
    if (!s.last_done_at) continue
    if (!best || !best.last_done_at || s.last_done_at > best.last_done_at) best = s
  }
  if (!best?.last_done_at) return null
  return {
    service_id: best.id,
    service_name: best.name,
    last_done_at: best.last_done_at,
    professional_name: best.professional_name,
    last_price: best.last_price != null ? Number(best.last_price) : null,
  }
}

export async function getLastVisit(contactId: string): Promise<LastVisit | null> {
  return pickLastVisit(await listServices(contactId))
}

interface AddServiceInput {
  name: string
  category: ServiceCategory
  cadenceDays?: number | null
  product?: string | null
  notes?: string | null
  lastDoneAt?: string | null
  scheduledAt?: string | null
}

export async function addService(contactId: string, input: AddServiceInput): Promise<ClientService> {
  const sql = getSql()
  const rows = (await sql`
    insert into client_services (contact_id, name, category, cadence_days, product, notes, last_done_at, scheduled_at)
    values (
      ${contactId},
      ${input.name},
      ${input.category},
      ${input.cadenceDays ?? null},
      ${input.product ?? null},
      ${input.notes ?? null},
      ${input.lastDoneAt ?? null},
      ${input.scheduledAt ?? null}
    )
    returning *
  `) as ClientService[]
  return rows[0]
}

export interface MarkServiceDoneOpts {
  doneAt?: string | null
  professionalName?: string | null
  lastPrice?: number | null
}

// Marca o serviço como realizado — reinicia o ciclo e limpa agendamento.
export async function markServiceDone(
  serviceId: string,
  opts: MarkServiceDoneOpts = {}
): Promise<ClientService | null> {
  const sql = getSql()
  const doneAt = opts.doneAt ?? new Date().toISOString()
  const rows = (await sql`
    update client_services set
      last_done_at = ${doneAt}::timestamptz,
      scheduled_at = null,
      professional_name = coalesce(${opts.professionalName ?? null}, professional_name),
      last_price = coalesce(${opts.lastPrice ?? null}, last_price)
    where id = ${serviceId}
    returning *
  `) as ClientService[]
  return rows[0] ?? null
}

/** Agenda serviço. Não grava last_price (preço de visita feita = só markServiceDone). */
export async function scheduleService(
  serviceId: string,
  scheduledAt: string,
  professionalName?: string | null,
  _quotedPrice?: number | null
): Promise<ClientService | null> {
  void _quotedPrice
  const sql = getSql()
  const rows = (await sql`
    update client_services set
      scheduled_at = ${scheduledAt}::timestamptz,
      professional_name = coalesce(${professionalName ?? null}, professional_name)
    where id = ${serviceId}
    returning *
  `) as ClientService[]
  return rows[0] ?? null
}

export async function setServiceProfessional(
  serviceId: string,
  professionalName: string
): Promise<ClientService | null> {
  const sql = getSql()
  const rows = (await sql`
    update client_services set professional_name = ${professionalName}
    where id = ${serviceId}
    returning *
  `) as ClientService[]
  return rows[0] ?? null
}

/**
 * Atualiza meta profissionais/preço.
 * last_price só se already_done (há last_done_at) — evita preço de agendamento futuro
 * aparecer como "valor da última visita".
 */
export async function patchServiceVisitMeta(
  serviceId: string,
  opts: { professionalName?: string | null; lastPrice?: number | null; allowLastPrice?: boolean }
): Promise<ClientService | null> {
  const sql = getSql()
  if (opts.allowLastPrice && opts.lastPrice != null) {
    const rows = (await sql`
      update client_services set
        professional_name = coalesce(${opts.professionalName ?? null}, professional_name),
        last_price = coalesce(${opts.lastPrice ?? null}, last_price)
      where id = ${serviceId}
        and last_done_at is not null
      returning *
    `) as ClientService[]
    if (rows[0]) return rows[0]
  }
  const rows = (await sql`
    update client_services set
      professional_name = coalesce(${opts.professionalName ?? null}, professional_name)
    where id = ${serviceId}
    returning *
  `) as ClientService[]
  return rows[0] ?? null
}

export async function clearServiceSchedule(serviceId: string): Promise<ClientService | null> {
  const sql = getSql()
  const rows = (await sql`
    update client_services set scheduled_at = null
    where id = ${serviceId}
    returning *
  `) as ClientService[]
  return rows[0] ?? null
}

export async function deactivateService(serviceId: string): Promise<ClientService | null> {
  const sql = getSql()
  const rows = (await sql`
    update client_services set active = false, scheduled_at = null
    where id = ${serviceId}
    returning *
  `) as ClientService[]
  return rows[0] ?? null
}

// Ao converter: marca como feitos só os serviços devidos nesta visita
// (atrasados, vencendo ou com agendamento até hoje) — não todos os do perfil.
export async function autoCompleteServicesOnConversion(contactId: string): Promise<string[]> {
  const services = enrichServices(await listServices(contactId))
  const endOfToday = new Date()
  endOfToday.setHours(23, 59, 59, 999)

  const toMark = services.filter((s) => {
    if (s.state === 'overdue' || s.state === 'due_soon') return true
    if (s.scheduled_at) return new Date(s.scheduled_at).getTime() <= endOfToday.getTime()
    return false
  })

  const marked: string[] = []
  for (const s of toMark) {
    await markServiceDone(s.id)
    marked.push(s.name)
  }
  return marked
}

// Próximos agendamentos globais — painel e lembretes visuais.
export async function listUpcomingSchedules(days = 7, limit = 20): Promise<ScheduledServiceRow[]> {
  const sql = getSql()
  return (await sql`
    select cs.*, c.name as contact_name
    from client_services cs
    join contacts c on c.id = cs.contact_id
    where cs.active = true
      and cs.scheduled_at is not null
      and cs.scheduled_at >= now()
      and cs.scheduled_at < now() + (${days}::int || ' days')::interval
    order by cs.scheduled_at asc
    limit ${limit}
  `) as ScheduledServiceRow[]
}
