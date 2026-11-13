import 'server-only'

import { getRomPanelId, type RomPanelId } from '@/lib/brand'
import { getSqlForUrl, type Sql } from '@/lib/db'
import type {
  AtivacaoUnit,
  BrandActivation,
  CreateBrandActivationInput,
} from '@/lib/ativacoes/types'
import { mapActivationRow } from '@/lib/ativacoes/store'
import { softTimeout } from '@/lib/ativacoes/soft-timeout'

export type PeerListResult = {
  activations: BrandActivation[]
  /** true quando a URL do peer existe mas a leitura falhou. */
  offline: boolean
  /** true quando nenhuma UNIT_*_DATABASE_URL do peer está configurada. */
  unconfigured: boolean
}

/** Peer lento não pode segurar o calendário local (prod: /api/ativacoes 504 @ 300s). */
export const PEER_LIST_SOFT_MS = 4_000
const PEER_STATEMENT_TIMEOUT_MS = 3_500

function peerUnitOf(local: RomPanelId): AtivacaoUnit {
  return local === 'brasil' ? 'iguatemi' : 'brasil'
}

/** Env canônica + legado — mesma ordem do Cérebro. */
export function peekPeerDatabaseUrl(
  local: RomPanelId = getRomPanelId(),
  env: Record<string, string | undefined> = process.env,
): string | null {
  const names =
    local === 'brasil'
      ? ['UNIT_IGUATEMI_DATABASE_URL', 'IGUATEMI_DATABASE_URL', 'NEON_IGUATEMI_DATABASE_URL']
      : ['UNIT_BRASIL_DATABASE_URL', 'BRASIL_DATABASE_URL', 'NEON_BRASIL_DATABASE_URL']
  for (const name of names) {
    const raw = env[name]?.trim()
    if (raw) return raw
  }
  return null
}

/** 42703 só no fallback pré-v2. Timeout (57014) e os demais erros não reconsultam. */
function isMissingEndTimeColumn(error: unknown): boolean {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? (error as { code?: unknown }).code
      : undefined
  if (code != null && code !== '42703') return false

  const column =
    error && typeof error === 'object' && 'column_name' in error
      ? (error as { column_name?: unknown }).column_name
      : undefined
  if (typeof column === 'string') return column === 'end_time'

  const msg = error instanceof Error ? error.message : String(error)
  return /column ["']end_time["'] does not exist/i.test(msg)
}

async function selectPeerMonthRows(sql: Sql, start: string): Promise<Record<string, unknown>[]> {
  const timeoutSql = `select set_config('statement_timeout', $1, true)`
  const timeoutParam = [String(PEER_STATEMENT_TIMEOUT_MS)]

  try {
    const results = await sql.transaction((txn) => [
      txn.query(timeoutSql, timeoutParam),
      txn`
        select
          id::text as id,
          day::text as day,
          start_time::text as start_time,
          end_time::text as end_time,
          brand,
          condition,
          notes,
          status,
          created_by_employee_id::text as created_by_employee_id,
          created_by_name,
          created_by_role,
          cancelled_by_name,
          cancelled_at,
          created_at,
          updated_at
        from unit_brand_activations
        where day >= ${start}::date
          and day < (${start}::date + interval '1 month')
        order by day asc, start_time asc, created_at asc
      `,
    ])
    return results[1] as Record<string, unknown>[]
  } catch (error) {
    if (!isMissingEndTimeColumn(error)) throw error
    // Peer ainda sem end_time (pré-v2): espelha início como fim.
    const results = await sql.transaction((txn) => [
      txn.query(timeoutSql, timeoutParam),
      txn`
        select
          id::text as id,
          day::text as day,
          start_time::text as start_time,
          start_time::text as end_time,
          brand,
          condition,
          notes,
          status,
          created_by_employee_id::text as created_by_employee_id,
          created_by_name,
          created_by_role,
          cancelled_by_name,
          cancelled_at,
          created_at,
          updated_at
        from unit_brand_activations
        where day >= ${start}::date
          and day < (${start}::date + interval '1 month')
        order by day asc, start_time asc, created_at asc
      `,
    ])
    return results[1] as Record<string, unknown>[]
  }
}

export function peerUnitForLocal(local: RomPanelId = getRomPanelId()): AtivacaoUnit {
  return peerUnitOf(local)
}

function requirePeerSql(local: RomPanelId = getRomPanelId()): { sql: Sql; peerUnit: AtivacaoUnit } {
  const url = peekPeerDatabaseUrl(local)
  if (!url) {
    throw new Error('Banco da outra unidade não configurado neste ambiente')
  }
  return { sql: getSqlForUrl(url), peerUnit: peerUnitOf(local) }
}

/**
 * Lê ativações do mês no banco da unidade irmã.
 * Por padrão peer é só leitura; `writable: true` para allowlist cross-unit (ex.: Amanda).
 * Falha / atraso de peer não derruba o calendário local — devolve offline.
 */
export async function listPeerBrandActivationsForMonth(
  month: string,
  opts?: { writable?: boolean },
): Promise<PeerListResult> {
  const local = getRomPanelId()
  const peerUnit = peerUnitOf(local)
  const writable = Boolean(opts?.writable)
  const url = peekPeerDatabaseUrl(local)
  if (!url) {
    return { activations: [], offline: false, unconfigured: true }
  }

  const offline: PeerListResult = { activations: [], offline: true, unconfigured: false }

  return softTimeout(
    (async (): Promise<PeerListResult> => {
      try {
        const sql = getSqlForUrl(url)
        const rows = await selectPeerMonthRows(sql, `${month}-01`)
        return {
          activations: rows.map((row) =>
            mapActivationRow(row, { unit: peerUnit, writable }),
          ),
          offline: false,
          unconfigured: false,
        }
      } catch (error) {
        console.error('[ativacoes] peer list failed', error instanceof Error ? error.message : error)
        return offline
      }
    })(),
    PEER_LIST_SOFT_MS,
    () => {
      console.error('[ativacoes] peer list soft-timeout', PEER_LIST_SOFT_MS)
      return offline
    },
  )
}

export async function getPeerBrandActivationById(id: string): Promise<BrandActivation | null> {
  const { sql, peerUnit } = requirePeerSql()
  const rows = (await sql`
    select
      id::text as id,
      day::text as day,
      start_time::text as start_time,
      end_time::text as end_time,
      brand,
      condition,
      notes,
      status,
      created_by_employee_id::text as created_by_employee_id,
      created_by_name,
      created_by_role,
      cancelled_by_name,
      cancelled_at,
      created_at,
      updated_at
    from unit_brand_activations
    where id = ${id}::uuid
    limit 1
  `) as Record<string, unknown>[]
  return rows[0] ? mapActivationRow(rows[0], { unit: peerUnit, writable: true }) : null
}

export async function createPeerBrandActivation(
  input: CreateBrandActivationInput,
): Promise<BrandActivation> {
  const { sql, peerUnit } = requirePeerSql()
  const notes = input.notes?.trim() ? input.notes.trim() : null
  const rows = (await sql`
    insert into unit_brand_activations (
      day, start_time, end_time, brand, condition, notes,
      created_by_employee_id, created_by_name, created_by_role
    ) values (
      ${input.day}::date,
      ${input.start_time}::time,
      ${input.end_time}::time,
      ${input.brand.trim()},
      ${input.condition},
      ${notes},
      ${input.created_by_employee_id ?? null}::uuid,
      ${input.created_by_name.trim()},
      ${input.created_by_role}
    )
    returning
      id::text as id,
      day::text as day,
      start_time::text as start_time,
      end_time::text as end_time,
      brand,
      condition,
      notes,
      status,
      created_by_employee_id::text as created_by_employee_id,
      created_by_name,
      created_by_role,
      cancelled_by_name,
      cancelled_at,
      created_at,
      updated_at
  `) as Record<string, unknown>[]
  const row = rows[0]
  if (!row) throw new Error('Falha ao criar ativação na outra unidade')
  return mapActivationRow(row, { unit: peerUnit, writable: true })
}

export async function cancelPeerBrandActivation(
  id: string,
  cancelledByName: string,
): Promise<BrandActivation | null> {
  const { sql, peerUnit } = requirePeerSql()
  const rows = (await sql`
    update unit_brand_activations
    set
      status = 'cancelled',
      cancelled_by_name = ${cancelledByName.trim()},
      cancelled_at = now(),
      updated_at = now()
    where id = ${id}::uuid
      and status = 'confirmed'
    returning
      id::text as id,
      day::text as day,
      start_time::text as start_time,
      end_time::text as end_time,
      brand,
      condition,
      notes,
      status,
      created_by_employee_id::text as created_by_employee_id,
      created_by_name,
      created_by_role,
      cancelled_by_name,
      cancelled_at,
      created_at,
      updated_at
  `) as Record<string, unknown>[]
  return rows[0] ? mapActivationRow(rows[0], { unit: peerUnit, writable: true }) : null
}

export function mergeSharedActivations(
  local: BrandActivation[],
  peer: BrandActivation[],
): BrandActivation[] {
  return [...local, ...peer].sort((a, b) => {
    if (a.day !== b.day) return a.day < b.day ? -1 : 1
    if (a.start_time !== b.start_time) return a.start_time < b.start_time ? -1 : 1
    if (a.unit !== b.unit) return a.unit < b.unit ? -1 : 1
    return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0
  })
}
