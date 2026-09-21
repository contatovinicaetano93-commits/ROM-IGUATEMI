import type { AuthSession } from '@/lib/auth'
import { getSql } from '@/lib/db'
import { occupancyMergeKey } from '@/lib/director-report/match-pro'
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
 * Contatos do profissional: preferência (cabelo/manicure) ou serviço/visita no nome.
 * Match por igualdade case-insensitive no texto gravado (vínculo vem do roster).
 */
export async function listContactIdsOwnedByProfessional(
  professionalName: string,
): Promise<string[]> {
  const name = professionalName.trim()
  if (!name) return []
  const sql = getSql()
  const rows = (await sql`
    select distinct id from (
      select c.id
      from contacts c
      where c.anonymized_at is null
        and (
          lower(trim(coalesce(c.preferred_hairstylist, ''))) = lower(trim(${name}))
          or lower(trim(coalesce(c.preferred_manicurist, ''))) = lower(trim(${name}))
        )
      union
      select cs.contact_id as id
      from client_services cs
      join contacts c on c.id = cs.contact_id
      where c.anonymized_at is null
        and cs.professional_name is not null
        and lower(trim(cs.professional_name)) = lower(trim(${name}))
      union
      select csv.contact_id as id
      from client_service_visits csv
      join contacts c on c.id = csv.contact_id
      where c.anonymized_at is null
        and csv.professional_name is not null
        and lower(trim(csv.professional_name)) = lower(trim(${name}))
    ) owned
  `) as { id: string }[]
  return rows.map((row) => row.id)
}

export async function contactBelongsToProfessional(
  contactId: string,
  professionalName: string,
): Promise<boolean> {
  const name = professionalName.trim()
  if (!name) return false
  const sql = getSql()
  const rows = (await sql`
    select 1 as ok
    where exists (
      select 1 from contacts c
      where c.id = ${contactId}::uuid
        and c.anonymized_at is null
        and (
          lower(trim(coalesce(c.preferred_hairstylist, ''))) = lower(trim(${name}))
          or lower(trim(coalesce(c.preferred_manicurist, ''))) = lower(trim(${name}))
        )
    )
    or exists (
      select 1 from client_services cs
      join contacts c on c.id = cs.contact_id
      where cs.contact_id = ${contactId}::uuid
        and c.anonymized_at is null
        and cs.professional_name is not null
        and lower(trim(cs.professional_name)) = lower(trim(${name}))
    )
    or exists (
      select 1 from client_service_visits csv
      join contacts c on c.id = csv.contact_id
      where csv.contact_id = ${contactId}::uuid
        and c.anonymized_at is null
        and csv.professional_name is not null
        and lower(trim(csv.professional_name)) = lower(trim(${name}))
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
  return rows.filter((row) => professionalNamesMatch(row.professional_name, professionalName))
}
