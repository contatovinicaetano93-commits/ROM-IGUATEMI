import { getSql } from '@/lib/db'
import { normalizePhone } from '@/lib/avec/normalize'

type Channel = 'whatsapp' | 'telegram' | 'avec' | 'instagram' | 'manual'

interface UpsertContactInput {
  phone?: string | null
  name?: string | null
  email?: string | null
  channel: Channel
  source: string
  avecClientId?: string | null
  status?: ContactStatus
}

export const CONTACT_STATUSES = ['novo', 'em_atendimento', 'agendado', 'convertido', 'perdido'] as const
export type ContactStatus = (typeof CONTACT_STATUSES)[number]

const STATUS_RANK: Record<ContactStatus, number> = {
  novo: 0,
  em_atendimento: 1,
  agendado: 2,
  convertido: 3,
  perdido: -1,
}

/** Avança no funil sem rebaixar (ex.: convertido não volta para agendado no sync Avec). */
export function mergeContactStatus(current: ContactStatus, incoming: ContactStatus): ContactStatus {
  if (incoming === 'perdido') return 'perdido'
  if (current === 'perdido' && incoming !== 'convertido') return current
  return STATUS_RANK[incoming] > STATUS_RANK[current] ? incoming : current
}

function resolveStatus(current: ContactStatus | string | undefined, incoming?: ContactStatus) {
  if (!incoming) return null
  if (!current || !CONTACT_STATUSES.includes(current as ContactStatus)) return incoming
  return mergeContactStatus(current as ContactStatus, incoming)
}

export interface ContactRow {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  channel: string
  source: string
  status: string
  avec_client_id: string | null
  notes: string | null
  preferred_manicurist: string | null
  preferred_hairstylist: string | null
  first_contact_at: string
  last_contact_at: string
  created_at: string
  anonymized_at: string | null
}

// Fluxo guiado: todo contato novo entra como "novo", sobe pro mesmo registro
// se o telefone já existir (evita duplicar KPI de canais diferentes falando
// com a mesma pessoa).
export async function upsertContact(input: UpsertContactInput): Promise<ContactRow> {
  const sql = getSql()
  const phone = input.phone ? normalizePhone(input.phone) ?? input.phone.trim() : null

  // Optimized UPSERT: use avec_client_id when available (primary upsert key)
  // Falls back to phone-based lookup only if no avec_client_id
  // Single query reduces from 3-4 queries down to 1 query per row
  if (input.avecClientId) {
    const rows = (await sql`
      insert into contacts (name, phone, email, channel, source, avec_client_id, status)
      values (
        ${input.name ?? null},
        ${phone},
        ${input.email ?? null},
        ${input.channel},
        ${input.source},
        ${input.avecClientId},
        ${input.status ?? 'novo'}
      )
      on conflict (avec_client_id) do update set
        last_contact_at = now(),
        name = coalesce(excluded.name, contacts.name),
        email = coalesce(excluded.email, contacts.email),
        phone = coalesce(excluded.phone, contacts.phone),
        status = case
          when contacts.status in ('novo', 'em_atendimento') then coalesce(excluded.status, contacts.status)
          when contacts.status = 'agendado' and excluded.status = 'convertido' then 'convertido'
          when contacts.status = 'convertido' then 'convertido'
          when contacts.status = 'perdido' and excluded.status = 'convertido' then 'convertido'
          else contacts.status
        end
      returning *
    `) as ContactRow[]
    return rows[0]
  }

  // Fallback: phone-based upsert if no avec_client_id
  const rows = (await sql`
    insert into contacts (name, phone, email, channel, source, status)
    values (
      ${input.name ?? null},
      ${phone},
      ${input.email ?? null},
      ${input.channel},
      ${input.source},
      ${input.status ?? 'novo'}
    )
    on conflict (phone) do update set
      last_contact_at = now(),
      name = coalesce(excluded.name, contacts.name),
      email = coalesce(excluded.email, contacts.email),
      avec_client_id = coalesce(excluded.avec_client_id, contacts.avec_client_id),
      status = case
        when contacts.status in ('novo', 'em_atendimento') then coalesce(excluded.status, contacts.status)
        when contacts.status = 'agendado' and excluded.status = 'convertido' then 'convertido'
        when contacts.status = 'convertido' then 'convertido'
        when contacts.status = 'perdido' and excluded.status = 'convertido' then 'convertido'
        else contacts.status
      end
    where contacts.phone is not null
    returning *
  `) as ContactRow[]
  return rows[0]
}

export async function getContactByAvecId(avecClientId: string): Promise<ContactRow | null> {
  const sql = getSql()
  const rows = (await sql`
    select * from contacts where avec_client_id = ${avecClientId} limit 1
  `) as ContactRow[]
  return rows[0] ?? null
}

export async function getContactById(id: string): Promise<ContactRow | null> {
  const sql = getSql()
  const rows = (await sql`select * from contacts where id = ${id} limit 1`) as ContactRow[]
  return rows[0] ?? null
}

/**
 * LGPD (direito ao esquecimento / retenção automática) — remove PII do contato.
 * Zera phone/avec_client_id de propósito: são as chaves que o upsertContact usa
 * pra casar um sync novo com essa linha, então zerá-las já impede re-identificação
 * futura sem precisar de guarda extra no upsert.
 */
export async function anonymizeContact(id: string): Promise<ContactRow | null> {
  const sql = getSql()
  const rows = (await sql`
    update contacts
    set name = null,
        phone = null,
        email = null,
        notes = null,
        avec_client_id = null,
        preferred_manicurist = null,
        preferred_hairstylist = null,
        anonymized_at = now()
    where id = ${id} and anonymized_at is null
    returning *
  `) as ContactRow[]
  if (!rows[0]) return null

  await sql`delete from contact_brief_cache where contact_id = ${id}`
  await sql`delete from contact_events where contact_id = ${id}`
  await sql`update client_services set notes = null, product = null where contact_id = ${id}`

  return rows[0]
}

export interface ContactEventRow {
  id: string
  contact_id: string | null
  channel: string
  direction: 'in' | 'out'
  handled_by: 'ai' | 'human' | 'system'
  payload: Record<string, unknown>
  error: string | null
  created_at: string
}

export async function listEvents(contactId: string, limit = 50): Promise<ContactEventRow[]> {
  const sql = getSql()
  return (await sql`
    select * from contact_events
    where contact_id = ${contactId}
    order by created_at desc
    limit ${limit}
  `) as ContactEventRow[]
}

interface UpdateContactInput {
  name?: string
  email?: string
  phone?: string
  status?: ContactStatus
  notes?: string
  preferredManicurist?: string | null
  preferredHairstylist?: string | null
}

// Atualização parcial e guiada: só mexe nos campos enviados (coalesce mantém o resto).
// NOTE: Potential race condition if two concurrent updates happen within milliseconds.
// Status merge logic is computed in-app, not in SQL. Trade-off: small race window for simpler code.
// TODO: Consider optimistic locking with version field for high-concurrency scenarios.
export async function updateContact(id: string, patch: UpdateContactInput): Promise<ContactRow | null> {
  const sql = getSql()
  const phone = patch.phone ? normalizePhone(patch.phone) ?? patch.phone.trim() : undefined

  let status: ContactStatus | null = patch.status ?? null
  if (patch.status) {
    const current = await getContactById(id)
    if (current) {
      status = mergeContactStatus(current.status as ContactStatus, patch.status)
    }
  }

  // null no PATCH = limpeza explícita → grava '' (≠ SQL NULL = nunca definido).
  const manicurist =
    patch.preferredManicurist === undefined
      ? null
      : (patch.preferredManicurist?.trim() ?? '')
  const hairstylist =
    patch.preferredHairstylist === undefined
      ? null
      : (patch.preferredHairstylist?.trim() ?? '')

  const rows = (await sql`
    update contacts set
      name = coalesce(${patch.name ?? null}, name),
      email = coalesce(${patch.email ?? null}, email),
      phone = coalesce(${phone ?? null}, phone),
      status = coalesce(${status}, status),
      notes = coalesce(${patch.notes ?? null}, notes),
      preferred_manicurist = case
        when ${patch.preferredManicurist !== undefined} then ${manicurist}
        else preferred_manicurist
      end,
      preferred_hairstylist = case
        when ${patch.preferredHairstylist !== undefined} then ${hairstylist}
        else preferred_hairstylist
      end,
      last_contact_at = now()
    where id = ${id}
    returning *
  `) as ContactRow[]
  return rows[0] ?? null
}

/**
 * Define manicure preferida (sync Avec).
 * Só preenche se ainda for NULL — '' = limpeza manual, não sobrescrever.
 */
export async function setPreferredManicurist(
  contactId: string,
  manicurist: string
): Promise<void> {
  const name = manicurist.trim()
  if (!name) return
  const sql = getSql()
  await sql`
    update contacts
    set preferred_manicurist = ${name}
    where id = ${contactId}
      and preferred_manicurist is null
  `
}

/**
 * Define cabeleireiro preferido (sync Avec).
 * Só preenche se ainda for NULL — '' = limpeza manual, não sobrescrever.
 */
export async function setPreferredHairstylist(
  contactId: string,
  hairstylist: string
): Promise<void> {
  const name = hairstylist.trim()
  if (!name) return
  const sql = getSql()
  await sql`
    update contacts
    set preferred_hairstylist = ${name}
    where id = ${contactId}
      and preferred_hairstylist is null
  `
}

interface LogEventInput {
  contactId: string | null
  channel: Channel
  direction: 'in' | 'out'
  handledBy: 'ai' | 'human' | 'system'
  payload: Record<string, unknown>
  error?: string | null
}

// Resiliente por design: erro na IA/API externa nunca derruba o webhook —
// fica registrado aqui com o campo `error` pra reprocessar ou investigar depois.
export async function logEvent(input: LogEventInput) {
  const sql = getSql()
  await sql`
    insert into contact_events (contact_id, channel, direction, handled_by, payload, error)
    values (
      ${input.contactId},
      ${input.channel},
      ${input.direction},
      ${input.handledBy},
      ${JSON.stringify(input.payload)}::jsonb,
      ${input.error ?? null}
    )
  `
}
