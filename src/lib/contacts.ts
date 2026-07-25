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

export const CONTACT_STATUSES = [
  'novo',
  'importado',
  'em_atendimento',
  'agendado',
  'convertido',
  'perdido',
] as const
export type ContactStatus = (typeof CONTACT_STATUSES)[number]

const STATUS_RANK: Record<ContactStatus, number> = {
  importado: 0,
  novo: 1,
  em_atendimento: 2,
  agendado: 3,
  convertido: 4,
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

function isUniqueViolation(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return /duplicate key|unique constraint|contacts_phone_idx|contacts_avec_client_id/i.test(msg)
}

/**
 * Decide telefone/avec_id ao fundir contato existente com payload do sync.
 * Nunca troca telefone se outro registro já usa o número (contacts_phone_idx).
 */
export function planContactMerge(
  existing: Pick<ContactRow, 'phone' | 'avec_client_id' | 'status'>,
  incoming: { phone: string | null; avecClientId: string | null; status?: ContactStatus },
): { phone: string | null; avecClientId: string | null; status: ContactStatus | null } {
  const nextStatus = resolveStatus(existing.status, incoming.status)
  let phone = existing.phone
  if (incoming.phone && !existing.phone) phone = incoming.phone
  // Só sobrescreve telefone se já for o mesmo (no-op) — troca real exige check no DB.
  if (incoming.phone && existing.phone && incoming.phone === existing.phone) phone = existing.phone

  let avecClientId = existing.avec_client_id
  if (incoming.avecClientId && !existing.avec_client_id) {
    avecClientId = incoming.avecClientId
  }
  // Não rouba avec_client_id de outro contato: se ambos preenchidos e divergem, mantém o atual.
  return { phone, avecClientId, status: nextStatus }
}

async function getContactByPhone(phone: string): Promise<ContactRow | null> {
  const sql = getSql()
  const rows = (await sql`
    select * from contacts where phone = ${phone} limit 1
  `) as ContactRow[]
  return rows[0] ?? null
}

async function applyContactMerge(
  existing: ContactRow,
  input: UpsertContactInput,
  phone: string | null,
): Promise<ContactRow> {
  const sql = getSql()
  const avecId = input.avecClientId?.trim() || null
  const planned = planContactMerge(existing, {
    phone,
    avecClientId: avecId,
    status: input.status,
  })

  // Troca de telefone só se o número novo estiver livre.
  let nextPhone = planned.phone
  if (phone && existing.phone && phone !== existing.phone) {
    const owner = await getContactByPhone(phone)
    if (!owner || owner.id === existing.id) nextPhone = phone
  } else if (phone && !existing.phone) {
    const owner = await getContactByPhone(phone)
    if (!owner) nextPhone = phone
  }

  // Anexa avec_client_id só se ninguém mais já tiver esse id.
  let nextAvec = planned.avecClientId
  if (avecId && existing.avec_client_id !== avecId) {
    if (!existing.avec_client_id) {
      const owner = await getContactByAvecId(avecId)
      if (!owner) nextAvec = avecId
      else nextAvec = existing.avec_client_id
    } else {
      nextAvec = existing.avec_client_id
    }
  }

  const nextStatus = planned.status
  const rows = (await sql`
    update contacts set
      last_contact_at = now(),
      name = coalesce(${input.name ?? null}, name),
      email = coalesce(${input.email ?? null}, email),
      phone = ${nextPhone},
      avec_client_id = ${nextAvec},
      status = case
        when ${nextStatus}::text is null then status
        when ${nextStatus}::text = 'importado' and status <> 'importado' then status
        when status in ('importado', 'novo', 'em_atendimento') then coalesce(${nextStatus}::text, status)
        when status = 'agendado' and ${nextStatus}::text = 'convertido' then 'convertido'
        when status = 'convertido' then 'convertido'
        when status = 'perdido' and ${nextStatus}::text = 'convertido' then 'convertido'
        else status
      end
    where id = ${existing.id}
    returning *
  `) as ContactRow[]
  return rows[0] ?? existing
}

// Fluxo guiado: mesmo telefone / mesmo avec_client_id = mesmo contato.
// Evita duplicate key em contacts_phone_idx quando WhatsApp/import já tem o número
// e o sync Avec tenta criar linha nova com avec_client_id.
export async function upsertContact(input: UpsertContactInput): Promise<ContactRow> {
  const sql = getSql()
  const phone = input.phone ? normalizePhone(input.phone) ?? input.phone.trim() : null
  const avecId = input.avecClientId?.trim() || null
  const status = input.status ?? 'novo'

  if (avecId) {
    const byAvec = await getContactByAvecId(avecId)
    if (byAvec) return applyContactMerge(byAvec, input, phone)
  }

  if (phone) {
    const byPhone = await getContactByPhone(phone)
    if (byPhone) return applyContactMerge(byPhone, input, phone)
  }

  try {
    if (avecId) {
      const rows = (await sql`
        insert into contacts (name, phone, email, channel, source, avec_client_id, status)
        values (
          ${input.name ?? null},
          ${phone},
          ${input.email ?? null},
          ${input.channel},
          ${input.source},
          ${avecId},
          ${status}
        )
        returning *
      `) as ContactRow[]
      if (!rows[0]) throw new Error('upsertContact: insert avec sem retorno')
      return rows[0]
    }

    const rows = (await sql`
      insert into contacts (name, phone, email, channel, source, status)
      values (
        ${input.name ?? null},
        ${phone},
        ${input.email ?? null},
        ${input.channel},
        ${input.source},
        ${status}
      )
      returning *
    `) as ContactRow[]
    if (!rows[0]) throw new Error('upsertContact: insert phone sem retorno')
    return rows[0]
  } catch (e) {
    if (!isUniqueViolation(e)) throw e
    // Corrida / colisão: resolve pelo id ou telefone e mescla.
    if (avecId) {
      const again = await getContactByAvecId(avecId)
      if (again) return applyContactMerge(again, input, phone)
    }
    if (phone) {
      const again = await getContactByPhone(phone)
      if (again) return applyContactMerge(again, input, phone)
    }
    throw e
  }
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
