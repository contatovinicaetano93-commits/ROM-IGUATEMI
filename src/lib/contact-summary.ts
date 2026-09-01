import { CONTACT_STATUSES, type ContactRow, type ContactStatus } from '@/lib/contacts'
import { getSql } from '@/lib/db'
import type { ClientService } from '@/lib/services'
import { DUE_SOON_DAYS, NOVOS_WINDOW_DAYS, SCHEDULED_SOON_DAYS } from '@/lib/salon/constants'
import { todayIso, toSalonDateIso } from '@/lib/salon/format'
import {
  ACTIVATED_QUEUE_WINDOW_DAYS,
  countPendingActivatedContacts,
  listPendingActivatedContacts,
} from '@/lib/salon/reactivation-kpi'
import { compareByOverdueThenName, urgencyForServices } from '@/lib/salon/urgency'

export interface ContactListItem extends ContactRow {
  overdue: number
  max_overdue_days: number
  due_soon: number
  scheduled_soon: number
  pending_actions: number
  urgency_score: number
  top_action: string | null
  /** Próximo horário na janela Agendados (hoje → +SCHEDULED_SOON_DAYS). */
  next_scheduled_at: string | null
  /** Último outreach de reativação (fila Ativados). */
  outreach_at?: string | null
}

export interface ListContactsWithSummaryOpts {
  limit?: number
  /** Busca server-side por nome (ilike) ou telefone (dígitos). */
  query?: string | null
  /** Só contatos com pending_actions > 0 (calcula sobre urgência de cadência/agenda). */
  pendingOnly?: boolean
  /** Filtro de status do funil (ex.: novo, importado) — server-side. */
  status?: string | null
  /** Canal (whatsapp/avec/manual/…). */
  channel?: string | null
  /** Lista alfabética da base (modo Todos) — sem priorizar urgência. */
  orderBy?: 'urgency' | 'name'
  /**
   * Fila Reativar (exclusiva, mesma prioridade da UI):
   * overdue → due_soon → scheduled.
   */
  urgencyQueue?: 'overdue' | 'due_soon' | 'scheduled' | null
}

export interface UrgencyQueueCounts {
  overdue: number
  due_soon: number
  scheduled: number
}

/** Filas da tela Contatos — urgência + novos da janela + sem serviço + ativados. */
export interface ContactQueueCounts extends UrgencyQueueCounts {
  /** Contatos criados na janela Novos (SP) ainda sem avec_client_id. */
  novos: number
  /** Passou da janela Novos e segue sem next_due — fora do funil de cadência. */
  sem_servicos: number
  /** Reativados pelo painel aguardando agenda/visita Avec (30d). */
  ativados: number
}

export interface ContactListResult {
  items: ContactListItem[]
  /** Total na base que casa o filtro (antes do limit da página). */
  total: number
}

function addIsoDays(isoDay: string, days: number): string {
  const [y, m, d] = isoDay.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

/** Próximo scheduled_at na janela hoje…+SCHEDULED_SOON_DAYS (fuso do salão). */
function nextScheduledInWindow(services: ClientService[]): string | null {
  const today = todayIso()
  const until = addIsoDays(today, SCHEDULED_SOON_DAYS)
  let best: string | null = null
  let bestTs = Number.POSITIVE_INFINITY
  for (const s of services) {
    if (!s.scheduled_at) continue
    const day = toSalonDateIso(s.scheduled_at)
    if (!day || day < today || day > until) continue
    const ts = new Date(s.scheduled_at).getTime()
    if (Number.isNaN(ts) || ts >= bestTs) continue
    bestTs = ts
    best = s.scheduled_at
  }
  return best
}

function withUrgency(
  contacts: ContactRow[],
  byContact: Map<string, ClientService[]>,
): ContactListItem[] {
  return contacts.map((c) => {
    const services = byContact.get(c.id) ?? []
    const u = urgencyForServices(services)
    return {
      ...c,
      overdue: u.overdue,
      max_overdue_days: u.max_overdue_days,
      due_soon: u.due_soon,
      scheduled_soon: u.scheduled_soon,
      pending_actions: u.pending_actions,
      urgency_score: u.urgency_score,
      top_action: u.top_action,
      next_scheduled_at: nextScheduledInWindow(services),
    }
  })
}

async function fetchContactsByIds(ids: string[]): Promise<ContactRow[]> {
  if (ids.length === 0) return []
  const sql = getSql()
  // postgres.js exige o helper sql(ids) para expandir IN (...).
  return (await sql`
    select * from contacts
    where id in ${sql(ids)}
      and anonymized_at is null
  `) as ContactRow[]
}

/** Carrega serviços só dos contatos pedidos — evita scan full de client_services. */
async function loadServicesByContactIds(ids: string[]): Promise<Map<string, ClientService[]>> {
  const byContact = new Map<string, ClientService[]>()
  if (ids.length === 0) return byContact
  const sql = getSql()
  const services = (await sql`
    select * from client_services
    where active = true and contact_id in ${sql(ids)}
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

/** Mantém a ordem dos IDs (ex.: ranking SQL por horário). */
async function orderContactsByIds(ids: string[]): Promise<ContactRow[]> {
  const contacts = await fetchContactsByIds(ids)
  const byId = new Map(contacts.map((c) => [c.id, c]))
  return ids.map((id) => byId.get(id)).filter((c): c is ContactRow => Boolean(c))
}

/**
 * Contatos com sinal de urgência (atraso / vencendo / agendado),
 * ranqueados no SQL — sem carregar a tabela inteira de serviços.
 *
 * Só conta atraso/vencendo com last_done_at real (não inventa visita).
 * Vencendo: janela DUE_SOON_DAYS (exclusivo vs atrasados).
 * Agendados: qualquer contato com horário hoje ou nos próximos
 * SCHEDULED_SOON_DAYS dias (não exclusivos — podem também estar
 * atrasados/vencendo; a fila mostra a agenda da semana).
 */
async function rankUrgentContactIds(
  limit: number,
  opts: {
    channel?: string | null
    urgencyQueue?: 'overdue' | 'due_soon' | 'scheduled' | null
  } = {},
): Promise<string[]> {
  const sql = getSql()
  const channel = opts.channel ?? null
  const queue = opts.urgencyQueue ?? null
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
            and (scheduled_at at time zone 'America/Sao_Paulo')::date
              >= (now() at time zone 'America/Sao_Paulo')::date
            and (scheduled_at at time zone 'America/Sao_Paulo')::date
              <= (now() at time zone 'America/Sao_Paulo')::date
                + (${SCHEDULED_SOON_DAYS} * interval '1 day')
        )::int as scheduled_soon,
        min(scheduled_at) filter (
          where scheduled_at is not null
            and (scheduled_at at time zone 'America/Sao_Paulo')::date
              >= (now() at time zone 'America/Sao_Paulo')::date
            and (scheduled_at at time zone 'America/Sao_Paulo')::date
              <= (now() at time zone 'America/Sao_Paulo')::date
                + (${SCHEDULED_SOON_DAYS} * interval '1 day')
        ) as next_scheduled
      from svc
      group by contact_id
    )
    select pc.contact_id
    from per_contact pc
    join contacts c on c.id = pc.contact_id
    where c.anonymized_at is null
      and (${channel}::text is null or c.channel = ${channel})
      and (
        (${queue}::text is null and pc.overdue + pc.due_soon + pc.scheduled_soon > 0)
        or (${queue}::text = 'overdue' and pc.overdue > 0)
        or (
          ${queue}::text = 'due_soon'
          and pc.overdue = 0
          and pc.due_soon > 0
        )
        or (${queue}::text = 'scheduled' and pc.scheduled_soon > 0)
      )
    order by
      case
        when ${queue}::text = 'scheduled'
          then extract(epoch from pc.next_scheduled)
      end asc nulls last,
      case
        when ${queue}::text = 'due_soon' then pc.due_soon
        when ${queue}::text = 'scheduled' then 0
        else pc.max_overdue_days
      end desc,
      pc.max_overdue_days desc,
      pc.overdue desc,
      pc.due_soon desc,
      pc.scheduled_soon desc
    limit ${limit}
  `) as { contact_id: string }[]
  return rows.map((r) => r.contact_id)
}

/** Totais das filas Reativar (Atrasados/Vencendo exclusivos; Agendados = agenda da semana). */
export async function countUrgencyQueues(
  opts: { channel?: string | null } = {},
): Promise<UrgencyQueueCounts> {
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
        count(*) filter (
          where next_due is not null
            and next_due >= now()
            and next_due <= now() + (${DUE_SOON_DAYS} * interval '1 day')
        )::int as due_soon,
        count(*) filter (
          where scheduled_at is not null
            and (scheduled_at at time zone 'America/Sao_Paulo')::date
              >= (now() at time zone 'America/Sao_Paulo')::date
            and (scheduled_at at time zone 'America/Sao_Paulo')::date
              <= (now() at time zone 'America/Sao_Paulo')::date
                + (${SCHEDULED_SOON_DAYS} * interval '1 day')
        )::int as scheduled_soon
      from svc
      group by contact_id
    )
    select
      count(*) filter (where pc.overdue > 0)::int as overdue,
      count(*) filter (where pc.overdue = 0 and pc.due_soon > 0)::int as due_soon,
      count(*) filter (where pc.scheduled_soon > 0)::int as scheduled
    from per_contact pc
    join contacts c on c.id = pc.contact_id
    where c.anonymized_at is null
      and (${channel}::text is null or c.channel = ${channel})
  `) as UrgencyQueueCounts[]
  return rows[0] ?? { overdue: 0, due_soon: 0, scheduled: 0 }
}

/**
 * Lista contatos com resumo de urgência.
 * Sem busca: prioriza quem tem atraso/ação pendente via ranking SQL.
 * Com busca: filtra no servidor por nome/telefone em toda a base.
 * Com status/channel: filtra server-side; retorna total antes do limit.
 */
export async function listContactsWithSummary(
  limitOrOpts: number | ListContactsWithSummaryOpts = 100,
): Promise<ContactListResult> {
  const opts: ListContactsWithSummaryOpts =
    typeof limitOrOpts === 'number' ? { limit: limitOrOpts } : limitOrOpts
  const limit = Math.min(Math.max(1, opts.limit ?? 100), 2000)
  const rawQuery = (opts.query ?? '').trim()
  const q = rawQuery.toLowerCase()
  const qDigits = rawQuery.replace(/\D/g, '')
  const nameTokens = q
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .slice(0, 5)
  const pendingOnly = opts.pendingOnly === true
  const status = parseStatus(opts.status)
  const channel = parseChannel(opts.channel)
  const orderByName = opts.orderBy === 'name'
  const urgencyQueue = opts.urgencyQueue ?? null

  const sql = getSql()

  // Busca por nome/telefone — tokens AND (ex.: "vinicius caetano") + dígitos.
  if (nameTokens.length > 0 || qDigits.length >= 3) {
    const t0 = nameTokens[0] ? `%${nameTokens[0]}%` : null
    const t1 = nameTokens[1] ? `%${nameTokens[1]}%` : null
    const t2 = nameTokens[2] ? `%${nameTokens[2]}%` : null
    const t3 = nameTokens[3] ? `%${nameTokens[3]}%` : null
    const t4 = nameTokens[4] ? `%${nameTokens[4]}%` : null
    const phonePattern = qDigits.length >= 3 ? `%${qDigits}%` : null
    const countRows = (await sql`
      select count(*)::int as n from contacts
      where anonymized_at is null
        and (${status}::text is null or status = ${status})
        and (${channel}::text is null or channel = ${channel})
        and (
          (
            ${t0}::text is not null
            and lower(coalesce(name, '')) like ${t0}
            and (${t1}::text is null or lower(coalesce(name, '')) like ${t1})
            and (${t2}::text is null or lower(coalesce(name, '')) like ${t2})
            and (${t3}::text is null or lower(coalesce(name, '')) like ${t3})
            and (${t4}::text is null or lower(coalesce(name, '')) like ${t4})
          )
          or (
            ${phonePattern}::text is not null
            and regexp_replace(coalesce(phone, ''), '\D', '', 'g') like ${phonePattern}
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
          (
            ${t0}::text is not null
            and lower(coalesce(name, '')) like ${t0}
            and (${t1}::text is null or lower(coalesce(name, '')) like ${t1})
            and (${t2}::text is null or lower(coalesce(name, '')) like ${t2})
            and (${t3}::text is null or lower(coalesce(name, '')) like ${t3})
            and (${t4}::text is null or lower(coalesce(name, '')) like ${t4})
          )
          or (
            ${phonePattern}::text is not null
            and regexp_replace(coalesce(phone, ''), '\D', '', 'g') like ${phonePattern}
          )
        )
      order by name nulls last, created_at desc
      limit ${limit}
    `) as ContactRow[]
    const byContact = await loadServicesByContactIds(contacts.map((c) => c.id))
    const withU = withUrgency(contacts, byContact)
    if (!pendingOnly) return { items: withU, total }
    const items = withU.filter((c) => c.pending_actions > 0)
    return { items, total: contacts.length < limit ? items.length : total }
  }

  // Todos: base da unidade em ordem alfabética (sem filtro de urgência).
  if (orderByName && !pendingOnly && !status) {
    const countRows = (await sql`
      select count(*)::int as n from contacts
      where anonymized_at is null
        and (${channel}::text is null or channel = ${channel})
    `) as { n: number }[]
    const total = countRows[0]?.n ?? 0
    const contacts = (await sql`
      select * from contacts
      where anonymized_at is null
        and (${channel}::text is null or channel = ${channel})
      order by lower(coalesce(name, '')) asc nulls last, created_at desc
      limit ${limit}
    `) as ContactRow[]
    const byContact = await loadServicesByContactIds(contacts.map((c) => c.id))
    return { items: withUrgency(contacts, byContact), total }
  }

  // Status do funil: página por created_at (não ranqueia a base inteira).
  if (status) {
    const countRows = (await sql`
      select count(*)::int as n from contacts
      where status = ${status}
        and anonymized_at is null
        and (${channel}::text is null or channel = ${channel})
    `) as { n: number }[]
    const total = countRows[0]?.n ?? 0

    if (pendingOnly) {
      const pendingIds = await rankUrgentContactIds(Math.min(limit * 4, 2000), {
        channel,
        urgencyQueue,
      })
      if (pendingIds.length === 0) return { items: [], total: 0 }
      const contacts = (await sql`
        select * from contacts
        where status = ${status}
          and anonymized_at is null
          and (${channel}::text is null or channel = ${channel})
          and id in ${sql(pendingIds)}
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
    const pendingIds = await rankUrgentContactIds(limit, { channel, urgencyQueue })
    const byContact = await loadServicesByContactIds(pendingIds)
    const ordered =
      urgencyQueue === 'scheduled'
        ? await orderContactsByIds(pendingIds)
        : await orderContactsByUrgency(pendingIds, byContact)
    const items = withUrgency(ordered, byContact)
    return { items, total: items.length }
  }

  // Default: urgentes via ranking SQL, depois recentes para completar a página.
  const urgentIds = await rankUrgentContactIds(limit, { channel, urgencyQueue: null })
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
              and id not in ${sql(urgentIds)}
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

function normalizeDayKey(raw: string | null | undefined): string {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  return todayIso()
}

/**
 * Contatos novos dos últimos NOVOS_WINDOW_DAYS dias sem cliente na Avec ainda.
 * O lead pode vir da Avec (agenda/atendimento), mas o ROM cria cadastro novo
 * porque ainda não existe no banco Avec (`avec_client_id` nulo).
 * Exclui só dump em massa (clients/backfill/lake) — não o sync operacional.
 *
 * Sai da lista quem já entrou no funil de cadência (serviço ativo com
 * `last_done_at` e `cadence_days`) — mesma condição que faz o contato contar em
 * Vencendo/Atrasados. Sem isso ele apareceria nas duas filas e as contagens
 * ficariam infladas. Quem fez serviço SEM cadência continua aqui, porque o
 * funil de reativação não pega esse caso.
 *
 * `day` é o fim da janela (default hoje), não um dia isolado.
 */
export async function countNewContactsNotInAvec(opts?: {
  day?: string | null
}): Promise<number> {
  const sql = getSql()
  const day = normalizeDayKey(opts?.day)
  const rows = (await sql`
    select count(*)::int as n
    from contacts
    where anonymized_at is null
      and channel = 'avec'
      and avec_client_id is null
      and status <> 'importado'
      and coalesce(source, '') not like 'avec_sync_clients%'
      and coalesce(source, '') not like 'avec_backfill%'
      and coalesce(source, '') not like 'avec_lake%'
      and created_at >= ((${day}::date - ${NOVOS_WINDOW_DAYS - 1}::int)::timestamp at time zone 'America/Sao_Paulo')
      and created_at < ((${day}::date + 1)::timestamp at time zone 'America/Sao_Paulo')
      and not exists (
        select 1
        from client_services cs
        where cs.contact_id = contacts.id
          and cs.active = true
          and cs.last_done_at is not null
          and cs.cadence_days is not null
      )
  `) as { n: number }[]
  return Number(rows[0]?.n ?? 0) || 0
}

/** Novos não usam badges de urgência — zera campos sem carregar client_services. */
function asNovosListItem(c: ContactRow): ContactListItem {
  return {
    ...c,
    overdue: 0,
    max_overdue_days: 0,
    due_soon: 0,
    scheduled_soon: 0,
    pending_actions: 0,
    urgency_score: 0,
    top_action: null,
    next_scheduled_at: null,
  }
}

/** Lista novos da janela sem cliente Avec ainda (mais recentes primeiro). */
export async function listNewContactsNotInAvec(opts?: {
  day?: string | null
  limit?: number
}): Promise<ContactListResult> {
  const sql = getSql()
  const day = normalizeDayKey(opts?.day)
  const limit = Math.min(Math.max(1, opts?.limit ?? 250), 500)
  // Um round-trip: colunas da lista + total via window (sem select * / services / urgency).
  const rows = (await sql`
    select
      id,
      name,
      phone,
      email,
      channel,
      source,
      status,
      avec_client_id,
      notes,
      preferred_manicurist,
      preferred_hairstylist,
      first_contact_at,
      last_contact_at,
      created_at,
      anonymized_at,
      count(*) over()::int as total
    from contacts
    where anonymized_at is null
      and channel = 'avec'
      and avec_client_id is null
      and status <> 'importado'
      and coalesce(source, '') not like 'avec_sync_clients%'
      and coalesce(source, '') not like 'avec_backfill%'
      and coalesce(source, '') not like 'avec_lake%'
      and created_at >= ((${day}::date - ${NOVOS_WINDOW_DAYS - 1}::int)::timestamp at time zone 'America/Sao_Paulo')
      and created_at < ((${day}::date + 1)::timestamp at time zone 'America/Sao_Paulo')
      and not exists (
        select 1
        from client_services cs
        where cs.contact_id = contacts.id
          and cs.active = true
          and cs.last_done_at is not null
          and cs.cadence_days is not null
      )
    order by created_at desc
    limit ${limit}
  `) as (ContactRow & { total: number })[]
  const total = Number(rows[0]?.total ?? 0) || 0
  const items = rows.map(({ total: _t, ...c }) => asNovosListItem(c))
  return { items, total }
}

/**
 * Fatia complementar à de Novos: já passou da janela e continua fora do funil
 * de cadência (sem serviço ativo com `last_done_at` + `cadence_days`).
 *
 * O recorte é por AUSÊNCIA de `next_due`, não por "nunca fez serviço". Quem fez
 * serviço sem cadência também não é pego por Vencendo/Atrasados — se o critério
 * fosse "sem serviço", essa pessoa escaparia das duas listas.
 *
 * Junto com `countNewContactsNotInAvec` a divisão é exaustiva: ou o contato tem
 * `next_due` (funil de cadência), ou está em Novos (janela), ou está aqui.
 *
 * Fora: anonimizados, dump em massa da Avec, `importado` e `perdido` — este
 * último é a porta de saída, acionada na tela de detalhe do contato.
 */
export async function countContactsWithoutServices(opts?: {
  day?: string | null
}): Promise<number> {
  const sql = getSql()
  const day = normalizeDayKey(opts?.day)
  const rows = (await sql`
    select count(*)::int as n
    from contacts
    where anonymized_at is null
      and status <> 'importado'
      and status <> 'perdido'
      and coalesce(source, '') not like 'avec_sync_clients%'
      and coalesce(source, '') not like 'avec_backfill%'
      and coalesce(source, '') not like 'avec_lake%'
      and created_at < ((${day}::date - ${NOVOS_WINDOW_DAYS - 1}::int)::timestamp at time zone 'America/Sao_Paulo')
      and not exists (
        select 1
        from client_services cs
        where cs.contact_id = contacts.id
          and cs.active = true
          and cs.last_done_at is not null
          and cs.cadence_days is not null
      )
  `) as { n: number }[]
  return Number(rows[0]?.n ?? 0) || 0
}

/** Lista os sem serviço (mais recentes primeiro) — sem limite de período. */
export async function listContactsWithoutServices(opts?: {
  day?: string | null
  limit?: number
}): Promise<ContactListResult> {
  const sql = getSql()
  const day = normalizeDayKey(opts?.day)
  const limit = Math.min(Math.max(1, opts?.limit ?? 250), 500)
  const total = await countContactsWithoutServices({ day })
  const contacts = (await sql`
    select *
    from contacts
    where anonymized_at is null
      and status <> 'importado'
      and status <> 'perdido'
      and coalesce(source, '') not like 'avec_sync_clients%'
      and coalesce(source, '') not like 'avec_backfill%'
      and coalesce(source, '') not like 'avec_lake%'
      and created_at < ((${day}::date - ${NOVOS_WINDOW_DAYS - 1}::int)::timestamp at time zone 'America/Sao_Paulo')
      and not exists (
        select 1
        from client_services cs
        where cs.contact_id = contacts.id
          and cs.active = true
          and cs.last_done_at is not null
          and cs.cadence_days is not null
      )
    order by created_at desc
    limit ${limit}
  `) as ContactRow[]
  const byContact = await loadServicesByContactIds(contacts.map((c) => c.id))
  return { items: withUrgency(contacts, byContact), total }
}

/** Totais das filas Contatos (reativar + novos da janela + sem serviço + ativados). */
export async function countContactQueues(opts?: {
  channel?: string | null
  day?: string | null
}): Promise<ContactQueueCounts> {
  const [urgency, novos, sem_servicos, ativados] = await Promise.all([
    countUrgencyQueues({ channel: opts?.channel }),
    countNewContactsNotInAvec({ day: opts?.day }),
    countContactsWithoutServices({ day: opts?.day }),
    countPendingActivatedContacts(ACTIVATED_QUEUE_WINDOW_DAYS),
  ])
  return { ...urgency, novos, sem_servicos, ativados }
}

/** Lista contatos na fila Ativados (outreach pelo painel, aguardando Avec). */
export async function listActivatedContacts(opts?: {
  limit?: number
}): Promise<ContactListResult> {
  const limit = Math.min(Math.max(1, opts?.limit ?? 250), 500)
  const pending = await listPendingActivatedContacts({ limit })
  const outreachAt = new Map(pending.map((p) => [p.contact_id, p.contacted_at]))
  const ids = pending.map((p) => p.contact_id)
  const byContact = await loadServicesByContactIds(ids)
  const contacts = await orderContactsByIds(ids)
  const items = withUrgency(contacts, byContact).map((item) => ({
    ...item,
    outreach_at: outreachAt.get(item.id) ?? null,
  }))
  const total = await countPendingActivatedContacts(ACTIVATED_QUEUE_WINDOW_DAYS)
  return { items, total }
}
