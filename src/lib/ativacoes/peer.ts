import 'server-only'

import { getRomPanelId, type RomPanelId } from '@/lib/brand'
import { getSqlForUrl, type Sql } from '@/lib/db'
import type { AtivacaoUnit, BrandActivation } from '@/lib/ativacoes/types'
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
  // IG Sql usa begin/unsafe (não transaction/query do Brasil).
  try {
    return await sql.begin(async (txn) => {
      await txn.unsafe(`select set_config('statement_timeout', $1, true)`, [
        String(PEER_STATEMENT_TIMEOUT_MS),
      ])
      return (await txn`
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
      `) as Record<string, unknown>[]
    })
  } catch (error) {
    if (!isMissingEndTimeColumn(error)) throw error
    // Peer ainda sem end_time (pré-v2): espelha início como fim.
    return sql.begin(async (txn) => {
      await txn.unsafe(`select set_config('statement_timeout', $1, true)`, [
        String(PEER_STATEMENT_TIMEOUT_MS),
      ])
      return (await txn`
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
      `) as Record<string, unknown>[]
    })
  }
}

/**
 * Lê ativações do mês no banco da unidade irmã (somente leitura).
 * Falha / atraso de peer não derruba o calendário local — devolve offline.
 */
export async function listPeerBrandActivationsForMonth(month: string): Promise<PeerListResult> {
  const local = getRomPanelId()
  const peerUnit = peerUnitOf(local)
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
            mapActivationRow(row, { unit: peerUnit, writable: false }),
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
