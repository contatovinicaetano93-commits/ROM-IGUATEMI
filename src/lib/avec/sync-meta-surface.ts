/**
 * Client-safe sync meta types + surface gates.
 * Keep free of db/sync imports — pages 'use client' consume this module.
 */

export type AvecSyncMeta = {
  status: string | null
  created_at: string | null
  stale: boolean
  hint: string | null
  /** Mensagem de erro do último finished (timeout/kill etc.). */
  error: string | null
  /** Último fast (caixa/Hoje). */
  fast_created_at: string | null
  fast_stale: boolean
  /** Nenhum sync finished ainda. */
  never_synced: boolean
  /** Full/ops (P1/P2/P3) — Visão analítica. */
  ops_created_at: string | null
  ops_stale: boolean
  /** Full/agenda — ou fast fresco cobre o dia. */
  agenda_created_at: string | null
  agenda_stale: boolean
  /** Full/catalog (0004). Não entra no stale top-level da Visão. */
  catalog_created_at: string | null
  catalog_stale: boolean
}

type FinanceiroStaleMeta = Pick<AvecSyncMeta, 'never_synced' | 'fast_stale'>
type VisaoStaleMeta = Pick<AvecSyncMeta, 'never_synced' | 'ops_stale'>
type RelatoriosStaleMeta = Pick<AvecSyncMeta, 'never_synced' | 'ops_stale' | 'fast_stale'>

/** Financeiro (caixa/dia): só fast stale bloqueia — ops velho não assusta Financeiro. */
export function isFinanceiroStale(meta: FinanceiroStaleMeta): boolean {
  return meta.never_synced || meta.fast_stale
}

/** Visão analítica (P1/P2/P3): só ops stale bloqueia — fast velho não assusta Visão. */
export function isVisaoStale(meta: VisaoStaleMeta): boolean {
  return meta.never_synced || meta.ops_stale
}

/** Relatórios (mix analítico + caixa): ops preferido; fast também relevante para receita. */
export function isRelatoriosStale(meta: RelatoriosStaleMeta): boolean {
  return meta.never_synced || meta.ops_stale || meta.fast_stale
}

export function financeiroSyncStaleMessage(meta: FinanceiroStaleMeta): string | null {
  if (!isFinanceiroStale(meta)) return null
  if (meta.never_synced) {
    return 'Nenhum sync Avec registrado ainda — rode o sync no Admin ou aguarde o cron.'
  }
  return 'Sync Avec fast desatualizado (>1h) — caixa/Hoje podem estar velhos.'
}

export function visaoSyncStaleMessage(meta: VisaoStaleMeta): string | null {
  if (!isVisaoStale(meta)) return null
  if (meta.never_synced) return 'Nenhum sync Avec registrado ainda — confira Admin / cron'
  return 'Snapshot Visão (P1/P2/P3) >24h — receita do dia ok via sync fast'
}

/** Info suave na Visão quando só fast está velho (ops fresco). */
export function visaoSyncFastInfoMessage(
  meta: Pick<AvecSyncMeta, 'never_synced' | 'ops_stale' | 'fast_stale'>,
): string | null {
  if (meta.never_synced || meta.ops_stale || !meta.fast_stale) return null
  return 'Sync Avec fast desatualizado (>1h) — números do dia podem estar velhos'
}

export function relatoriosSyncStaleMessage(meta: RelatoriosStaleMeta): string | null {
  if (!isRelatoriosStale(meta)) return null
  if (meta.never_synced) return 'Nenhum sync Avec registrado ainda — confira Admin / cron.'
  if (meta.fast_stale && !meta.ops_stale) {
    return 'Sync Avec fast desatualizado (>1h) — números de caixa podem estar velhos.'
  }
  if (meta.ops_stale) return 'Snapshot Visão (P1/P2/P3) >24h — receita do dia ok via sync fast.'
  return 'Snapshot Avec (ocupação/canais/pacotes) >24h — receita do dia ok via sync fast.'
}
