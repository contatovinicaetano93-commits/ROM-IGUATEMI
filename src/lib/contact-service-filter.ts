import 'server-only'

import { getSql } from '@/lib/db'
import {
  isBlankOrPlaceholderFamily,
  normalizeServiceFamilyKey,
  serviceFamilyLabel,
  serviceFamilyMatches,
} from '@/lib/salon/service-family'
import { toSalonDateIso } from '@/lib/salon/format'

export type ServiceFamilyOption = {
  key: string
  label: string
  count: number
}

export type ServiceLastDoneFilter = {
  /** Família normalizada (ex.: `reflexo`, `corte`). */
  serviceFamily: string
  /** Inclusive, calendário America/Sao_Paulo (YYYY-MM-DD). */
  lastDoneFrom?: string | null
  lastDoneTo?: string | null
  /**
   * Quando setado, só conta serviços desse profissional
   * (variantes Avec já resolvidas pelo caller).
   */
  professionalNameVariants?: readonly string[] | null
}

function isIsoDay(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value))
}

type ServiceNameCountRow = { name: string; c: number }

/**
 * Opções de serviço a partir dos SKUs da carteira (ou da unidade).
 * Agrupa preço Avec → família; ignora placeholder Atendimento.
 */
export async function listServiceFamilyOptions(opts?: {
  contactIds?: readonly string[] | null
  professionalNameVariants?: readonly string[] | null
  limit?: number
}): Promise<ServiceFamilyOption[]> {
  const sql = getSql()
  const contactIds = opts?.contactIds?.filter(Boolean) ?? null
  const proVariants = opts?.professionalNameVariants?.map((n) => n.trim()).filter(Boolean) ?? null
  const limit = Math.min(Math.max(1, opts?.limit ?? 40), 80)

  if (contactIds && contactIds.length === 0) return []

  let rows: ServiceNameCountRow[]
  if (contactIds && proVariants && proVariants.length > 0) {
    rows = (await sql`
      select name, count(*)::int as c
      from client_services
      where name is not null and trim(name) <> '' and last_done_at is not null
        and contact_id in ${sql(contactIds as string[])}
        and trim(coalesce(professional_name, '')) in ${sql(proVariants as string[])}
      group by name
      order by c desc
      limit 500
    `) as ServiceNameCountRow[]
  } else if (contactIds) {
    rows = (await sql`
      select name, count(*)::int as c
      from client_services
      where name is not null and trim(name) <> '' and last_done_at is not null
        and contact_id in ${sql(contactIds as string[])}
      group by name
      order by c desc
      limit 500
    `) as ServiceNameCountRow[]
  } else if (proVariants && proVariants.length > 0) {
    rows = (await sql`
      select name, count(*)::int as c
      from client_services
      where name is not null and trim(name) <> '' and last_done_at is not null
        and trim(coalesce(professional_name, '')) in ${sql(proVariants as string[])}
      group by name
      order by c desc
      limit 500
    `) as ServiceNameCountRow[]
  } else {
    rows = (await sql`
      select name, count(*)::int as c
      from client_services
      where name is not null and trim(name) <> '' and last_done_at is not null
      group by name
      order by c desc
      limit 500
    `) as ServiceNameCountRow[]
  }

  const byFamily = new Map<string, number>()
  for (const row of rows) {
    const key = normalizeServiceFamilyKey(row.name)
    if (isBlankOrPlaceholderFamily(key)) continue
    byFamily.set(key, (byFamily.get(key) ?? 0) + Number(row.c || 0))
  }

  return [...byFamily.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))
    .slice(0, limit)
    .map(([key, count]) => ({ key, label: serviceFamilyLabel(key), count }))
}

type ServiceDoneRow = { contact_id: string; name: string; last_done_at: string | Date }

/**
 * Contatos cuja última vez na família de serviço cai na janela (ou existe, se sem datas).
 * Retorna map contactId → last_done_at ISO.
 */
export async function mapContactsByServiceLastDone(
  contactIds: readonly string[],
  filter: ServiceLastDoneFilter,
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (contactIds.length === 0) return out
  const family = normalizeServiceFamilyKey(filter.serviceFamily)
  if (!family || isBlankOrPlaceholderFamily(family)) return out

  const from = isIsoDay(filter.lastDoneFrom) ? filter.lastDoneFrom : null
  const to = isIsoDay(filter.lastDoneTo) ? filter.lastDoneTo : null
  const proVariants =
    filter.professionalNameVariants?.map((n) => n.trim()).filter(Boolean) ?? null

  const sql = getSql()
  let rows: ServiceDoneRow[]
  if (proVariants && proVariants.length > 0) {
    rows = (await sql`
      select contact_id::text as contact_id, name, last_done_at
      from client_services
      where contact_id in ${sql(contactIds as string[])}
        and name is not null and trim(name) <> '' and last_done_at is not null
        and trim(coalesce(professional_name, '')) in ${sql(proVariants as string[])}
    `) as ServiceDoneRow[]
  } else {
    rows = (await sql`
      select contact_id::text as contact_id, name, last_done_at
      from client_services
      where contact_id in ${sql(contactIds as string[])}
        and name is not null and trim(name) <> '' and last_done_at is not null
    `) as ServiceDoneRow[]
  }

  const best = new Map<string, string>()
  for (const row of rows) {
    if (!serviceFamilyMatches(row.name, family)) continue
    const at =
      typeof row.last_done_at === 'string'
        ? row.last_done_at
        : row.last_done_at.toISOString()
    const day = toSalonDateIso(at)
    if (!day) continue
    if (from && day < from) continue
    if (to && day > to) continue
    const prev = best.get(row.contact_id)
    if (!prev || at > prev) best.set(row.contact_id, at)
  }

  return best
}

/** Intersecta carteira com filtro serviço+data; devolve ids ordenados por última vez desc. */
export async function filterContactIdsByServiceLastDone(
  contactIds: readonly string[],
  filter: ServiceLastDoneFilter,
): Promise<{ ids: string[]; lastDoneById: Map<string, string> }> {
  const lastDoneById = await mapContactsByServiceLastDone(contactIds, filter)
  const ids = [...lastDoneById.entries()]
    .sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0))
    .map(([id]) => id)
  return { ids, lastDoneById }
}
