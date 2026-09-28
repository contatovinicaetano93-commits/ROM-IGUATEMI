import 'server-only'

import { getRomPanelId, type RomPanelId } from '@/lib/brand'
import { getSql } from '@/lib/db'
import type { AtivacaoUnit, BrandActivation } from '@/lib/ativacoes/types'
import { mapActivationRow } from '@/lib/ativacoes/store'

export type PeerListResult = {
  activations: BrandActivation[]
  /** true quando a URL do peer existe mas a leitura falhou. */
  offline: boolean
  /** true quando nenhuma UNIT_*_DATABASE_URL do peer está configurada. */
  unconfigured: boolean
}

function peerUnitOf(local: RomPanelId): AtivacaoUnit {
  return local === 'brasil' ? 'iguatemi' : 'brasil'
}

/** Env canônica + legado — mesma ordem do Cérebro. */
export function peekPeerDatabaseUrl(
  local: RomPanelId = getRomPanelId(),
  env: NodeJS.ProcessEnv = process.env,
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

/**
 * Lê ativações do mês no banco da unidade irmã (somente leitura).
 * Falha de peer não derruba o calendário local — devolve offline.
 */
export async function listPeerBrandActivationsForMonth(month: string): Promise<PeerListResult> {
  const local = getRomPanelId()
  const peerUnit = peerUnitOf(local)
  const url = peekPeerDatabaseUrl(local)
  if (!url) {
    return { activations: [], offline: false, unconfigured: true }
  }

  try {
    const sql = getSql(url)
    const start = `${month}-01`
    let rows: Record<string, unknown>[]
    try {
      rows = (await sql`
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
    } catch {
      // Peer ainda sem end_time (pré-v2): espelha início como fim.
      rows = (await sql`
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
    }

    return {
      activations: rows.map((row) =>
        mapActivationRow(row, { unit: peerUnit, writable: false }),
      ),
      offline: false,
      unconfigured: false,
    }
  } catch (error) {
    console.error('[ativacoes] peer list failed', error instanceof Error ? error.message : error)
    return { activations: [], offline: true, unconfigured: false }
  }
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
