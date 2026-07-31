import { getSql, type Sql } from '@/lib/db'
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

/**
 * Avança no funil sem rebaixar (ex.: convertido não volta para agendado no sync Avec).
 * IG: permite remarcação (perdido → agendado/em_atendimento) e heal novo → importado.
 */
export function mergeContactStatus(current: ContactStatus, incoming: ContactStatus): ContactStatus {
  if (incoming === 'perdido') return 'perdido'
  if (current === 'novo' && incoming === 'importado') return 'importado'
  // Dump/default não demota quem já é importado (≠ lead novo).
  if (current === 'importado' && incoming === 'novo') return 'importado'
  if (
    current === 'perdido' &&
    (incoming === 'agendado' || incoming === 'convertido' || incoming === 'em_atendimento')
  ) {
    return incoming
  }
  if (current === 'perdido') return current
  return STATUS_RANK[incoming] > STATUS_RANK[current] ? incoming : current
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

/** Serializa upserts do mesmo telefone/avec no mesmo processo (Promise.all agenda+atendidos). */
const upsertChains = new Map<string, Promise<unknown>>()

function withUpsertKey<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = upsertChains.get(key) ?? Promise.resolve()
  const next = prev.then(fn, fn)
  upsertChains.set(
    key,
    next.then(
      () => undefined,
      () => undefined,
    ),
  )
  return next
}

export function isUniqueViolation(e: unknown): boolean {
  if (!e || typeof e !== 'object') {
    const msg = e instanceof Error ? e.message : String(e)
    return /unique constraint|duplicate key/i.test(msg)
  }
  const code = (e as { code?: string }).code
  if (code === '23505') return true
  const msg = e instanceof Error ? e.message : String(e)
  return /unique constraint|duplicate key|contacts_phone_idx|contacts_avec_client_id_idx/i.test(msg)
}

/** Só E.164 via normalizePhone — nunca grava telefone cru (bate no índice único). */
export function resolveUpsertPhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  return normalizePhone(raw)
}

async function findByPhone(sql: Sql, phone: string): Promise<ContactRow | null> {
  const rows = (await sql`
    select * from contacts where phone = ${phone} limit 1
  `) as ContactRow[]
  return rows[0] ?? null
}

async function findByAvec(sql: Sql, avecClientId: string): Promise<ContactRow | null> {
  const rows = (await sql`
    select * from contacts where avec_client_id = ${avecClientId} limit 1
  `) as ContactRow[]
  return rows[0] ?? null
}

/**
 * Reaponta FKs do doador para o sobrevivente e remove o doador.
 * Usado quando telefone e avec_client_id estão em linhas diferentes.
 */
async function absorbContact(sql: Sql, survivorId: string, donorId: string): Promise<void> {
  if (survivorId === donorId) return

  await sql`
    update client_services
    set contact_id = ${survivorId}::uuid
    where contact_id = ${donorId}::uuid
  `
  await sql`
    update contact_events
    set contact_id = ${survivorId}::uuid
    where contact_id = ${donorId}::uuid
  `
  await sql`delete from contact_brief_cache where contact_id = ${donorId}::uuid`
  await sql`
    update whatsapp_aftercare_messages
    set contact_id = ${survivorId}::uuid
    where contact_id = ${donorId}::uuid
  `

  // Preserva funil/dados do doador antes do delete (ex.: convertido não some no merge).
  // avec_client_id fica pro claimAvecOnto/updateContactRow após liberar o unique do doador.
  const pair = (await sql`
    select id, status, name, email, notes, preferred_manicurist, preferred_hairstylist,
           last_contact_at
    from contacts
    where id = ${survivorId}::uuid or id = ${donorId}::uuid
  `) as Pick<
    ContactRow,
    | 'id'
    | 'status'
    | 'name'
    | 'email'
    | 'notes'
    | 'preferred_manicurist'
    | 'preferred_hairstylist'
    | 'last_contact_at'
  >[]
  const survivor = pair.find((r) => r.id === survivorId)
  const donor = pair.find((r) => r.id === donorId)
  if (survivor && donor) {
    const status = mergeContactStatus(
      survivor.status as ContactStatus,
      donor.status as ContactStatus,
    )
    await sql`
      update contacts
      set
        status = ${status},
        name = coalesce(name, ${donor.name}),
        email = coalesce(email, ${donor.email}),
        notes = coalesce(notes, ${donor.notes}),
        preferred_manicurist = coalesce(preferred_manicurist, ${donor.preferred_manicurist}),
        preferred_hairstylist = coalesce(preferred_hairstylist, ${donor.preferred_hairstylist}),
        last_contact_at = greatest(last_contact_at, ${donor.last_contact_at}::timestamptz)
      where id = ${survivorId}::uuid
    `
  }

  // Libera unique indexes antes do delete (CASCADE cobre o resto).
  await sql`
    update contacts
    set phone = null, avec_client_id = null
    where id = ${donorId}::uuid
  `
  await sql`delete from contacts where id = ${donorId}::uuid`
}

async function updateContactRow(
  sql: Sql,
  id: string,
  input: UpsertContactInput,
  phone: string | null,
): Promise<ContactRow> {
  const rows = (await sql`
    update contacts set
      last_contact_at = now(),
      name = coalesce(${input.name ?? null}, name),
      email = coalesce(${input.email ?? null}, email),
      phone = case
        when ${phone}::text is null then phone
        when exists (
          select 1 from contacts c2
          where c2.phone = ${phone}
            and c2.id <> ${id}::uuid
        ) then phone
        else ${phone}
      end,
      avec_client_id = case
        when ${input.avecClientId ?? null}::text is null then avec_client_id
        when avec_client_id is not null then avec_client_id
        when exists (
          select 1 from contacts c2
          where c2.avec_client_id = ${input.avecClientId ?? null}
            and c2.id <> ${id}::uuid
        ) then avec_client_id
        else ${input.avecClientId ?? null}
      end,
      status = case
        when ${input.status ?? null}::text is null then status
        when ${input.status ?? null} = 'perdido' then 'perdido'
        when status = 'novo' and ${input.status ?? null} = 'importado' then 'importado'
        when status = 'importado' and ${input.status ?? null} = 'novo' then 'importado'
        when status = 'perdido' and ${input.status ?? null} in ('convertido', 'agendado', 'em_atendimento')
          then ${input.status ?? null}
        when status = 'perdido' then status
        when status = 'convertido' then 'convertido'
        when status = 'agendado' and ${input.status ?? null} = 'convertido' then 'convertido'
        when status = 'agendado' then 'agendado'
        when status = 'em_atendimento' and ${input.status ?? null} in ('agendado', 'convertido')
          then ${input.status ?? null}
        when status = 'em_atendimento' then 'em_atendimento'
        when status in ('importado', 'novo') then ${input.status ?? null}
        else status
      end
    where id = ${id}::uuid
    returning *
  `) as ContactRow[]
  return rows[0]!
}

/**
 * Se o avec_id do input mora em outra linha, absorve essa linha no sobrevivente
 * (phone-first) para não perder vínculo de agendamento/serviço.
 */
async function claimAvecOnto(
  sql: Sql,
  survivor: ContactRow,
  input: UpsertContactInput,
  phone: string | null,
): Promise<ContactRow> {
  const avec = input.avecClientId?.trim() || null
  if (!avec) {
    return updateContactRow(sql, survivor.id, input, phone)
  }

  const avecOwner = await findByAvec(sql, avec)
  if (avecOwner && avecOwner.id !== survivor.id) {
    await absorbContact(sql, survivor.id, avecOwner.id)
  }

  try {
    return await updateContactRow(sql, survivor.id, { ...input, avecClientId: avec }, phone)
  } catch (e) {
    if (!isUniqueViolation(e)) throw e
    // Corrida: telefone/avec tomados — re-lê e funde.
    if (phone) {
      const byPhone = await findByPhone(sql, phone)
      if (byPhone) {
        if (byPhone.id !== survivor.id) {
          await absorbContact(sql, byPhone.id, survivor.id)
          return updateContactRow(sql, byPhone.id, input, phone)
        }
        return updateContactRow(sql, byPhone.id, { ...input, avecClientId: null }, null)
      }
    }
    return updateContactRow(sql, survivor.id, { ...input, avecClientId: null }, null)
  }
}

async function insertPhoneFirst(
  sql: Sql,
  input: UpsertContactInput,
  phone: string,
): Promise<ContactRow> {
  const avec = input.avecClientId?.trim() || null
  try {
    const rows = (await sql`
      insert into contacts (name, phone, email, channel, source, avec_client_id, status)
      values (
        ${input.name ?? null},
        ${phone},
        ${input.email ?? null},
        ${input.channel},
        ${input.source},
        ${avec},
        ${input.status ?? 'novo'}
      )
      on conflict (phone) do update set
        last_contact_at = now(),
        name = coalesce(excluded.name, contacts.name),
        email = coalesce(excluded.email, contacts.email),
        avec_client_id = case
          when excluded.avec_client_id is null then contacts.avec_client_id
          when contacts.avec_client_id is not null then contacts.avec_client_id
          when exists (
            select 1 from contacts c2
            where c2.avec_client_id = excluded.avec_client_id
              and c2.id <> contacts.id
          ) then contacts.avec_client_id
          else excluded.avec_client_id
        end,
        status = case
          when excluded.status is null then contacts.status
          when excluded.status = 'perdido' then 'perdido'
          when contacts.status = 'novo' and excluded.status = 'importado' then 'importado'
          when contacts.status = 'importado' and excluded.status = 'novo' then 'importado'
          when contacts.status = 'perdido' and excluded.status in ('convertido', 'agendado', 'em_atendimento')
            then excluded.status
          when contacts.status = 'perdido' then contacts.status
          when contacts.status = 'convertido' then 'convertido'
          when contacts.status = 'agendado' and excluded.status = 'convertido' then 'convertido'
          when contacts.status = 'agendado' then 'agendado'
          when contacts.status = 'em_atendimento' and excluded.status in ('agendado', 'convertido')
            then excluded.status
          when contacts.status = 'em_atendimento' then 'em_atendimento'
          when contacts.status in ('importado', 'novo') then excluded.status
          else contacts.status
        end
      where contacts.phone is not null
      returning *
    `) as ContactRow[]
    const row = rows[0]
    if (!row) {
      const again = await findByPhone(sql, phone)
      if (again) return claimAvecOnto(sql, again, input, phone)
      throw new Error('upsertContact: ON CONFLICT (phone) sem RETURNING')
    }
    // Se avec ficou em outra linha, absorve agora.
    if (avec && row.avec_client_id !== avec) {
      return claimAvecOnto(sql, row, input, phone)
    }
    return row
  } catch (e) {
    if (!isUniqueViolation(e)) throw e
    const byPhone = await findByPhone(sql, phone)
    if (byPhone) return claimAvecOnto(sql, byPhone, input, phone)
    if (avec) {
      const byAvec = await findByAvec(sql, avec)
      if (byAvec) return claimAvecOnto(sql, byAvec, input, phone)
    }
    throw e
  }
}

async function insertAvecOnly(sql: Sql, input: UpsertContactInput, avec: string): Promise<ContactRow> {
  try {
    const rows = (await sql`
      insert into contacts (name, phone, email, channel, source, avec_client_id, status)
      values (
        ${input.name ?? null},
        null,
        ${input.email ?? null},
        ${input.channel},
        ${input.source},
        ${avec},
        ${input.status ?? 'novo'}
      )
      on conflict (avec_client_id) do update set
        last_contact_at = now(),
        name = coalesce(excluded.name, contacts.name),
        email = coalesce(excluded.email, contacts.email),
        status = case
          when excluded.status is null then contacts.status
          when excluded.status = 'perdido' then 'perdido'
          when contacts.status = 'novo' and excluded.status = 'importado' then 'importado'
          when contacts.status = 'importado' and excluded.status = 'novo' then 'importado'
          when contacts.status = 'perdido' and excluded.status in ('convertido', 'agendado', 'em_atendimento')
            then excluded.status
          when contacts.status = 'perdido' then contacts.status
          when contacts.status = 'convertido' then 'convertido'
          when contacts.status = 'agendado' and excluded.status = 'convertido' then 'convertido'
          when contacts.status = 'agendado' then 'agendado'
          when contacts.status = 'em_atendimento' and excluded.status in ('agendado', 'convertido')
            then excluded.status
          when contacts.status = 'em_atendimento' then 'em_atendimento'
          when contacts.status in ('importado', 'novo') then excluded.status
          else contacts.status
        end
      returning *
    `) as ContactRow[]
    return rows[0]!
  } catch (e) {
    if (!isUniqueViolation(e)) throw e
    const byAvec = await findByAvec(sql, avec)
    if (byAvec) return updateContactRow(sql, byAvec.id, input, null)
    throw e
  }
}

async function upsertContactUnlocked(input: UpsertContactInput): Promise<ContactRow> {
  const sql = getSql()
  const phone = resolveUpsertPhone(input.phone)
  const avec = input.avecClientId?.trim() || null

  // Phone-first: índice contacts_phone_idx é a chave de merge do sync.
  if (phone) {
    const byPhone = await findByPhone(sql, phone)
    if (byPhone) return claimAvecOnto(sql, byPhone, input, phone)
  }

  if (avec) {
    const byAvec = await findByAvec(sql, avec)
    if (byAvec) return claimAvecOnto(sql, byAvec, input, phone)
  }

  if (phone) return insertPhoneFirst(sql, input, phone)
  if (avec) return insertAvecOnly(sql, input, avec)

  const rows = (await sql`
    insert into contacts (name, phone, email, channel, source, status)
    values (
      ${input.name ?? null},
      null,
      ${input.email ?? null},
      ${input.channel},
      ${input.source},
      ${input.status ?? 'novo'}
    )
    returning *
  `) as ContactRow[]
  return rows[0]!
}

// Fluxo guiado: todo contato novo entra como "novo", sobe pro mesmo registro
// se o telefone já existir (evita duplicar KPI de canais diferentes falando
// com a mesma pessoa).
export async function upsertContact(input: UpsertContactInput): Promise<ContactRow> {
  const phone = resolveUpsertPhone(input.phone)
  const avec = input.avecClientId?.trim() || null
  const key = phone ? `phone:${phone}` : avec ? `avec:${avec}` : `anon:${input.channel}:${input.source}`
  return withUpsertKey(key, () => upsertContactUnlocked(input))
}

export async function getContactByAvecId(avecClientId: string): Promise<ContactRow | null> {
  return findByAvec(getSql(), avecClientId)
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
  const phone = patch.phone !== undefined ? resolveUpsertPhone(patch.phone) : undefined

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

  try {
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
  } catch (e) {
    if (!isUniqueViolation(e) || !phone) throw e
    // Telefone já de outro contato — mantém phone atual.
    const rows = (await sql`
      update contacts set
        name = coalesce(${patch.name ?? null}, name),
        email = coalesce(${patch.email ?? null}, email),
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
      ${input.payload},
      ${input.error ?? null}
    )
  `
}
