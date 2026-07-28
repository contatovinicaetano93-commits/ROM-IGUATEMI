import { getSql } from '@/lib/db'
import { enrichServices } from '@/lib/recommendations'
import { todayIso, toSalonDateIso } from '@/lib/salon/format'
import { enqueueAftercare } from '@/lib/whatsapp/aftercare'

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

/** Horizonte da projeção de LTV, em anos — acordado com o Vini (Sprint 3). */
export const LTV_HORIZON_YEARS = 2

export interface ClientStats {
  /** Média de last_price entre os serviços com preço registrado — null se nenhum tiver preço. */
  ticket_avg: number | null
  /** Média de cadence_days definida pelo salão nos serviços ativos — não é frequência real medida
   *  (client_services guarda só a última ocorrência de cada serviço, não um log de visitas). */
  cadence_avg_days: number | null
  /** Serviços distintos com pelo menos uma execução registrada (não é contagem de visitas). */
  completed_services_count: number
  /**
   * Projeção, não histórico real: ticket_avg × (365 / cadence_avg_days) × LTV_HORIZON_YEARS.
   * Não existe log de receita por cliente hoje (client_services só guarda o último preço de
   * cada serviço) — quando isso existir, dá pra trocar por LTV medido de verdade.
   */
  ltv_projection: number | null
}

/** Ficha do cliente (Sprint 3). LTV é projeção — ver ClientStats.ltv_projection. */
export function computeClientStats(services: ClientService[]): ClientStats {
  const priced = services.filter((s) => s.last_price != null && Number(s.last_price) > 0)
  const ticket_avg =
    priced.length > 0
      ? Math.round((priced.reduce((sum, s) => sum + Number(s.last_price), 0) / priced.length) * 100) / 100
      : null

  const withCadence = services.filter((s) => s.active && s.cadence_days != null && s.cadence_days > 0)
  const cadence_avg_days =
    withCadence.length > 0
      ? Math.round(withCadence.reduce((sum, s) => sum + (s.cadence_days ?? 0), 0) / withCadence.length)
      : null

  const completed_services_count = services.filter((s) => s.last_done_at).length

  const ltv_projection =
    ticket_avg != null && cadence_avg_days != null && cadence_avg_days > 0
      ? Math.round(ticket_avg * (365 / cadence_avg_days) * LTV_HORIZON_YEARS)
      : null

  return { ticket_avg, cadence_avg_days, completed_services_count, ltv_projection }
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

// Marca o serviço como realizado — reinicia o ciclo.
// Só limpa scheduled_at do mesmo dia SP do doneAt (não apaga remarcação futura).
// Não regride last_done_at (greatest) — evita aftercare duplicado quando 0051/0002
// mandam horários diferentes no mesmo dia SP.
export async function markServiceDone(
  serviceId: string,
  opts: MarkServiceDoneOpts = {}
): Promise<ClientService | null> {
  const sql = getSql()
  const doneAt = opts.doneAt ?? new Date().toISOString()
  const before = (await sql`
    select last_done_at from client_services where id = ${serviceId} limit 1
  `) as { last_done_at: string | null }[]
  const prevDone = before[0]?.last_done_at ?? null

  const rows = (await sql`
    update client_services set
      last_done_at = case
        when last_done_at is null then ${doneAt}::timestamptz
        when ${doneAt}::timestamptz > last_done_at then ${doneAt}::timestamptz
        else last_done_at
      end,
      scheduled_at = case
        when scheduled_at is null then null
        when (scheduled_at at time zone 'America/Sao_Paulo')::date
          = (${doneAt}::timestamptz at time zone 'America/Sao_Paulo')::date
          then null
        else scheduled_at
      end,
      professional_name = coalesce(${opts.professionalName ?? null}, professional_name),
      last_price = coalesce(${opts.lastPrice ?? null}, last_price)
    where id = ${serviceId}
    returning *
  `) as ClientService[]
  const service = rows[0] ?? null
  if (service) {
    const prevDay = prevDone ? toSalonDateIso(prevDone) : null
    const newDay = toSalonDateIso(service.last_done_at)
    // Aftercare no máx. 1× por dia SP do serviço.
    if (prevDay !== newDay) {
      await enqueueAftercare(service).catch(() => undefined)
    }
  }
  return service
}

/** Agenda serviço. Não grava last_price (preço de visita feita = só markServiceDone).
 * Não reabre se já foi concluído no mesmo dia (SP) — evita race fast sync 0051∥0002.
 */
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
      and (
        last_done_at is null
        or (last_done_at at time zone 'America/Sao_Paulo')::date
          <> (coalesce(${scheduledAt}::timestamptz, now()) at time zone 'America/Sao_Paulo')::date
      )
    returning *
  `) as ClientService[]
  return rows[0] ?? null
}

/** Preenche cadence_days só se ainda estiver null (não sobrescreve cadência manual). */
export async function ensureServiceCadence(
  serviceId: string,
  cadenceDays: number,
): Promise<ClientService | null> {
  if (!Number.isFinite(cadenceDays) || cadenceDays <= 0) return null
  const sql = getSql()
  const rows = (await sql`
    update client_services set cadence_days = ${Math.floor(cadenceDays)}
    where id = ${serviceId} and cadence_days is null
    returning *
  `) as ClientService[]
  return rows[0] ?? null
}

/**
 * Remove agendamentos órfãos do dia — serviços ainda com scheduled_at hoje
 * que não estão na agenda aberta da Avec (0051). Evita KPI/lista inflados
 * depois que o status virou Pago/Cancelado.
 *
 * Só toca contatos ligados à Avec (`avec_client_id`) — agenda ROM/manual pura
 * não é apagada. Caller não deve invocar se 0051 veio truncado.
 *
 * keepServiceIds vazio: limpa todos do dia com avec_client_id (caller só invoca
 * quando a Avec trouxe linhas do dia — senão dia 100% pago/cancel deixava órfãos).
 */
export async function clearOrphanSchedulesForDay(
  day: string,
  keepServiceIds: string[],
): Promise<number> {
  const sql = getSql()
  if (keepServiceIds.length === 0) {
    const rows = (await sql`
      update client_services cs
      set scheduled_at = null
      from contacts c
      where cs.contact_id = c.id
        and c.avec_client_id is not null
        and c.anonymized_at is null
        and cs.scheduled_at is not null
        and (cs.scheduled_at at time zone 'America/Sao_Paulo')::date = ${day}::date
      returning cs.id
    `) as { id: string }[]
    return rows.length
  }
  const rows = (await sql`
    update client_services cs
    set scheduled_at = null
    from contacts c
    where cs.contact_id = c.id
      and c.avec_client_id is not null
      and c.anonymized_at is null
      and cs.scheduled_at is not null
      and (cs.scheduled_at at time zone 'America/Sao_Paulo')::date = ${day}::date
      and not (cs.id = any(${keepServiceIds}::uuid[]))
    returning cs.id
  `) as { id: string }[]
  return rows.length
}

/** Agendamentos abertos só do dia (painel Hoje / alinhado ao Pipeline). */
export async function listTodaySchedules(
  day: string,
  limit = 150,
): Promise<ScheduledServiceRow[]> {
  const sql = getSql()
  return (await sql`
    select cs.*, c.name as contact_name
    from client_services cs
    join contacts c on c.id = cs.contact_id
    where cs.active = true
      and c.anonymized_at is null
      and cs.scheduled_at is not null
      and cs.scheduled_at >= (${day}::date::timestamp at time zone 'America/Sao_Paulo')
      and cs.scheduled_at < ((${day}::date + 1)::timestamp at time zone 'America/Sao_Paulo')
      and (
        cs.last_done_at is null
        or cs.last_done_at < (${day}::date::timestamp at time zone 'America/Sao_Paulo')
        or cs.last_done_at >= ((${day}::date + 1)::timestamp at time zone 'America/Sao_Paulo')
      )
    order by cs.scheduled_at asc
    limit ${limit}
  `) as ScheduledServiceRow[]
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
  const today = todayIso()

  const toMark = services.filter((s) => {
    if (s.state === 'overdue' || s.state === 'due_soon') return true
    if (s.scheduled_at) {
      const day = toSalonDateIso(s.scheduled_at)
      return day != null && day <= today
    }
    return false
  })

  const marked: string[] = []
  for (const s of toMark) {
    await markServiceDone(s.id)
    marked.push(s.name)
  }
  return marked
}

/** Agenda do dia de um profissional específico — usado pelo bot Telegram de funcionários. */
export async function listTodayScheduleForProfessional(
  professionalName: string,
  day?: string,
): Promise<ScheduledServiceRow[]> {
  const sql = getSql()
  const salonDay = day ?? todayIso()
  return (await sql`
    select cs.*, c.name as contact_name
    from client_services cs
    join contacts c on c.id = cs.contact_id
    where cs.active = true
      and c.anonymized_at is null
      and cs.scheduled_at is not null
      and lower(cs.professional_name) = lower(${professionalName})
      and (cs.scheduled_at at time zone 'America/Sao_Paulo')::date = ${salonDay}::date
    order by cs.scheduled_at asc
  `) as ScheduledServiceRow[]
}

// Próximos agendamentos globais — painel e lembretes visuais.
export async function listUpcomingSchedules(days = 7, limit = 20): Promise<ScheduledServiceRow[]> {
  const sql = getSql()
  const from = todayIso()
  const [y, m, d] = from.split('-').map(Number)
  const end = new Date(Date.UTC(y!, m! - 1, d! + days))
  const to = end.toISOString().slice(0, 10)
  return (await sql`
    select cs.*, c.name as contact_name
    from client_services cs
    join contacts c on c.id = cs.contact_id
    where cs.active = true
      and c.anonymized_at is null
      and cs.scheduled_at is not null
      and (cs.scheduled_at at time zone 'America/Sao_Paulo')::date >= ${from}::date
      and (cs.scheduled_at at time zone 'America/Sao_Paulo')::date < ${to}::date
    order by cs.scheduled_at asc
    limit ${limit}
  `) as ScheduledServiceRow[]
}

/** Pipeline do dia: agendados ainda abertos + concluídos (last_done_at no dia). */
export async function listTodayPipeline(day: string): Promise<{
  scheduled: ScheduledServiceRow[]
  completed: ScheduledServiceRow[]
}> {
  const sql = getSql()
  const [scheduled, completed] = await Promise.all([
    sql`
      select cs.*, c.name as contact_name
      from client_services cs
      join contacts c on c.id = cs.contact_id
      where cs.active = true
        and c.anonymized_at is null
        and cs.scheduled_at is not null
        and cs.scheduled_at >= (${day}::date::timestamp at time zone 'America/Sao_Paulo')
        and cs.scheduled_at < ((${day}::date + 1)::timestamp at time zone 'America/Sao_Paulo')
        and (
          cs.last_done_at is null
          or cs.last_done_at < (${day}::date::timestamp at time zone 'America/Sao_Paulo')
          or cs.last_done_at >= ((${day}::date + 1)::timestamp at time zone 'America/Sao_Paulo')
        )
      order by cs.scheduled_at asc
      limit 400
    `,
    sql`
      select cs.*, c.name as contact_name
      from client_services cs
      join contacts c on c.id = cs.contact_id
      where cs.active = true
        and c.anonymized_at is null
        and cs.last_done_at is not null
        and cs.last_done_at >= (${day}::date::timestamp at time zone 'America/Sao_Paulo')
        and cs.last_done_at < ((${day}::date + 1)::timestamp at time zone 'America/Sao_Paulo')
      order by cs.last_done_at asc
      limit 400
    `,
  ])
  return {
    scheduled: scheduled as ScheduledServiceRow[],
    completed: completed as ScheduledServiceRow[],
  }
}
