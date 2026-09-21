import type { AuthSession } from '@/lib/auth'
import { getSql } from '@/lib/db'
import {
  namesLooselyMatch,
  occupancyMergeKey,
} from '@/lib/director-report/match-pro'
import { findEmployeeById } from '@/lib/employees'

/**
 * Nome Avec vinculado ao colaborador logado.
 * Só escopa quando há `professional_name` gravado (cargo Profissional).
 * Recepção/staff sem vínculo vê a base da unidade.
 */
export async function resolveSessionProfessionalScope(
  session: AuthSession | null | undefined,
): Promise<string | null> {
  if (!session?.employeeId) return null
  const employee = await findEmployeeById(session.employeeId)
  const name = employee?.professional_name?.trim()
  return name || null
}

/**
 * Dono/admin/financeiro com `professional_name` (ex.: Romeu) precisa do vínculo
 * Avec p/ Meu faturamento e da carteira própria — mas as filas de lead
 * (Novos / Sem serviço / Ativados) continuam da unidade.
 * Staff profissional vê só a carteira; leads unitários ficam fora.
 */
export function professionalKeepsUnitLeadQueues(
  session: AuthSession | null | undefined,
): boolean {
  if (!session) return false
  return session.role === 'admin' || session.role === 'financeiro'
}

/** Compara nomes de profissional com a mesma chave do relatório (acentos/case). */
export function professionalNamesMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const ka = a ? occupancyMergeKey(a) : ''
  const kb = b ? occupancyMergeKey(b) : ''
  if (!ka || !kb) return false
  return ka === kb
}

/**
 * Match amplo: chave canônica OU nomes frouxos (Romeu ↔ Romeu Felipe,
 * apelido Avec ↔ nome completo do cadastro).
 */
export function professionalNameOwns(
  candidateName: string | null | undefined,
  sessionProfessionalName: string,
): boolean {
  const raw = candidateName?.trim()
  if (!raw) return false
  if (professionalNamesMatch(raw, sessionProfessionalName)) return true
  return namesLooselyMatch(occupancyMergeKey(raw), occupancyMergeKey(sessionProfessionalName))
}

/** Nomes brutos na base que batem com o profissional da sessão. */
export async function listMatchingProfessionalNameVariants(
  professionalName: string,
): Promise<string[]> {
  const name = professionalName.trim()
  if (!name) return []
  const sql = getSql()
  const rows = (await sql`
    select distinct trim(n) as name from (
      select professional_name as n from client_services
      where professional_name is not null and trim(professional_name) <> ''
      union
      select professional_name as n from client_service_visits
      where professional_name is not null and trim(professional_name) <> ''
      union
      select preferred_hairstylist as n from contacts
      where preferred_hairstylist is not null and trim(preferred_hairstylist) <> ''
      union
      select preferred_manicurist as n from contacts
      where preferred_manicurist is not null and trim(preferred_manicurist) <> ''
    ) names
    where trim(n) <> ''
  `) as { name: string }[]

  const matched = new Set<string>()
  matched.add(name)
  for (const row of rows) {
    const candidate = row.name?.trim()
    if (!candidate) continue
    if (professionalNameOwns(candidate, name)) matched.add(candidate)
  }
  return [...matched]
}

/**
 * Contatos do profissional: preferência (cabelo/manicure) ou serviço/visita
 * em qualquer variante de nome Avec que case com o vínculo do colaborador.
 */
export async function listContactIdsOwnedByProfessional(
  professionalName: string,
): Promise<string[]> {
  const variants = await listMatchingProfessionalNameVariants(professionalName)
  if (variants.length === 0) return []
  const sql = getSql()
  const rows = (await sql`
    select distinct id from (
      select c.id
      from contacts c
      where c.anonymized_at is null
        and (
          trim(coalesce(c.preferred_hairstylist, '')) in ${sql(variants)}
          or trim(coalesce(c.preferred_manicurist, '')) in ${sql(variants)}
        )
      union
      select cs.contact_id as id
      from client_services cs
      join contacts c on c.id = cs.contact_id
      where c.anonymized_at is null
        and cs.professional_name is not null
        and trim(cs.professional_name) in ${sql(variants)}
      union
      select csv.contact_id as id
      from client_service_visits csv
      join contacts c on c.id = csv.contact_id
      where c.anonymized_at is null
        and csv.professional_name is not null
        and trim(csv.professional_name) in ${sql(variants)}
    ) owned
  `) as { id: string }[]
  return rows.map((row) => row.id)
}

export async function contactBelongsToProfessional(
  contactId: string,
  professionalName: string,
): Promise<boolean> {
  const variants = await listMatchingProfessionalNameVariants(professionalName)
  if (variants.length === 0) return false
  const sql = getSql()
  const rows = (await sql`
    select 1 as ok
    where exists (
      select 1 from contacts c
      where c.id = ${contactId}::uuid
        and c.anonymized_at is null
        and (
          trim(coalesce(c.preferred_hairstylist, '')) in ${sql(variants)}
          or trim(coalesce(c.preferred_manicurist, '')) in ${sql(variants)}
        )
    )
    or exists (
      select 1 from client_services cs
      join contacts c on c.id = cs.contact_id
      where cs.contact_id = ${contactId}::uuid
        and c.anonymized_at is null
        and cs.professional_name is not null
        and trim(cs.professional_name) in ${sql(variants)}
    )
    or exists (
      select 1 from client_service_visits csv
      join contacts c on c.id = csv.contact_id
      where csv.contact_id = ${contactId}::uuid
        and c.anonymized_at is null
        and csv.professional_name is not null
        and trim(csv.professional_name) in ${sql(variants)}
    )
    limit 1
  `) as { ok: number }[]
  return rows.length > 0
}

/** Filtra linhas de agenda/pipeline pelo nome do profissional no serviço. */
export function filterByProfessionalName<T extends { professional_name?: string | null }>(
  rows: readonly T[],
  professionalName: string,
): T[] {
  return rows.filter((row) => professionalNameOwns(row.professional_name, professionalName))
}

/** Filtra playbook / filas para só contatos do profissional. */
export function filterByOwnedContactIds<T extends { contact_id: string }>(
  rows: readonly T[],
  ownedIds: readonly string[],
): T[] {
  if (ownedIds.length === 0) return []
  const owned = new Set(ownedIds)
  return rows.filter((row) => owned.has(row.contact_id))
}

/** Chave de cache estável (acentos/case) para escopo por profissional. */
export function professionalScopeCacheKey(professionalName: string | null): string {
  if (!professionalName) return 'all'
  const key = occupancyMergeKey(professionalName)
  return key || 'all'
}
