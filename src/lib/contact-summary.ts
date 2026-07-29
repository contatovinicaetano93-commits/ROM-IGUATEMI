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

/** Carrega serviços só dos contatos pedidos — evita scan full de client_services. */
async function loadActiveServices(contactIds: string[]): Promise<Map<string, ClientService[]>> {
  if (contactIds.length === 0) return new Map()
  const sql = getSql()
  const rows = (await sql`
    select
      id, contact_id, name, category, product, professional_name, cadence_days,
      last_done_at, last_price, scheduled_at, active, notes, created_at
    from client_services
    where active = true and contact_id = any(${contactIds}::uuid[])
  `) as ClientService[]
  return mapServices(rows)
}

/**
 * Contatos com pendência (urgência de serviço OU só recomendação upsell/cross-sell),
 * ranqueados no SQL — sem carregar a tabela inteira de serviços.
 * Urgentes primeiro; candidatos a recomendação entram depois (pending_actions via JS).
 */
async function rankUrgentContactIds(limit: number): Promise<string[]> {
  const sql = getSql()
  const rows = (await sql`
    with svc as (
      select
        contact_id,
        category,
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
        )::int as scheduled_soon,
        bool_or(category = 'bem_estar') as has_bem_estar,
        bool_or(category = 'corte') as has_corte,
        bool_or(category = 'tratamento') as has_tratamento,
        bool_or(category = 'coloracao') as has_coloracao
      from svc
      group by contact_id
    )
    select contact_id
    from per_contact
    where overdue + due_soon + scheduled_soon > 0
       or has_bem_estar
       or (has_corte and has_tratamento)
       or (has_corte and not has_coloracao)
    order by
      (overdue + due_soon + scheduled_soon > 0) desc,
      max_overdue_days desc,
      overdue desc,
      due_soon desc,
      scheduled_soon desc
    limit ${limit}
  `) as { contact_id: string }[]
  return rows.map((r) => r.contact_id)
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
    if (pendingOnly) {
      // Escopo = status: total real de pendentes (inclui só-recomendação) + página.
      const contacts = (await sql`
        select * from contacts
        where status = ${status}
          and anonymized_at is null
          and (${channel}::text is null or channel = ${channel})
      `) as ContactRow[]
      const byContact = await loadActiveServices(contacts.map((c) => c.id))
      const items = withUrgency(contacts, byContact).filter((c) => c.pending_actions > 0)
      items.sort(compareByOverdueThenName)
      return { items: items.slice(0, limit), total: items.length }
    }

    const countRows = (await sql`
      select count(*)::int as n from contacts
      where status = ${status}
        and anonymized_at is null
        and (${channel}::text is null or channel = ${channel})
    `) as { n: number }[]
    const total = countRows[0]?.n ?? 0
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

  // Pending: usa rankUrgentContactIds para evitar scan full de client_services.
  if (pendingOnly) {
    const urgentIds = await rankUrgentContactIds(limit * 4)
    const byContact = await loadActiveServices(urgentIds)
    const pendingRanked = urgentIds
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

  // Default (sem pending): candidatos SQL (atrasados / próximos / agendados).
  const candidateCap = Math.min(Math.max(limit * 4, 120), 400)
  const candidateRows = (await sql`
    select contact_id
    from client_services
    where active = true
      and (
        (
          last_done_at is not null
          and cadence_days is not null
          and (last_done_at::date + cadence_days) <= (now() at time zone 'America/Sao_Paulo')::date + 7
        )
        or (
          scheduled_at is not null
          and scheduled_at <= (now() at time zone 'America/Sao_Paulo') + interval '14 days'
        )
      )
    group by contact_id
    limit ${candidateCap}
  `) as { contact_id: string }[]
  const candidateIds = candidateRows.map((r) => r.contact_id)
  const byContact = await loadActiveServices(candidateIds)

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
