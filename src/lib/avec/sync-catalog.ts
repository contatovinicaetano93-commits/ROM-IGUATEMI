/**
 * Catálogo Avec 0004 — fatias por invocação + critério de “já sincronizado”.
 * Puro / testável (sem DB) para o cron full/catalog caber no maxDuration=800.
 */

/** Catálogo completo no máximo ~1×/dia quando o dump terminou (sem hasMore). */
export const CLIENT_DUMP_MIN_GAP_MS = 20 * 60 * 60_000

/**
 * Páginas 0004 por invocação (×250 rows).
 * 20×250 = 5k upserts — cabe no orçamento 720s; dump grande retoma na próxima cron.
 */
export const CATALOG_MAX_PAGES_PER_RUN_DEFAULT = 20
export const CATALOG_MAX_PAGES_PER_RUN_CAP = 80

export type CatalogPaginationSlice = {
  hasMore?: boolean
  nextPage?: number | null
  startPage?: number
  endPage?: number
}

export type CatalogSyncStatsLike = {
  clients_upserted?: number
  pagination?: Record<string, CatalogPaginationSlice> | null
}

/** Lê AVEC_CATALOG_MAX_PAGES (1–80); default 20. */
export function getCatalogMaxPagesPerRun(): number {
  const raw = process.env.AVEC_CATALOG_MAX_PAGES?.trim()
  if (!raw) return CATALOG_MAX_PAGES_PER_RUN_DEFAULT
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 1) return CATALOG_MAX_PAGES_PER_RUN_DEFAULT
  return Math.min(Math.floor(n), CATALOG_MAX_PAGES_PER_RUN_CAP)
}

export function parseCatalogStats(raw: unknown): CatalogSyncStatsLike | null {
  if (raw == null) return null
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as CatalogSyncStatsLike
    } catch {
      return null
    }
  }
  if (typeof raw === 'object') return raw as CatalogSyncStatsLike
  return null
}

/** Página 0004 pendente no último run (Continuar sync / cron resume). */
export function catalog0004PendingNextPage(
  stats: CatalogSyncStatsLike | null | undefined,
): number | null {
  const entry = stats?.pagination?.['0004']
  if (!entry?.hasMore) return null
  const next = entry.nextPage
  if (next == null || !Number.isFinite(next) || next < 1) return null
  return Math.floor(next)
}

/**
 * Decide se o dump 0004 deve rodar nesta invocação.
 * - Force env on/off
 * - Lote pendente (hasMore) → sempre sim (resume)
 * - Último dump com progresso e sem pendência → só após minGap
 */
export function shouldRunClientCatalogDump(opts: {
  envFlag?: string | null
  lastRun: { created_at: string; stats?: unknown } | null
  now?: number
  minGapMs?: number
}): boolean {
  const flag = opts.envFlag?.trim().toLowerCase()
  if (flag === '1' || flag === 'true') return true
  if (flag === '0' || flag === 'false') return false

  const last = opts.lastRun
  if (!last?.created_at) return true

  const stats = parseCatalogStats(last.stats)
  if (catalog0004PendingNextPage(stats) != null) return true

  const upserted = Number(stats?.clients_upserted ?? 0)
  if (!Number.isFinite(upserted) || upserted <= 0) return true

  const now = opts.now ?? Date.now()
  const age = now - new Date(last.created_at).getTime()
  const minGap = opts.minGapMs ?? CLIENT_DUMP_MIN_GAP_MS
  return age >= minGap
}

/**
 * Após abort mid-upsert: não avança o cursor — refaz o mesmo startPage
 * (upsert de contato é idempotente).
 */
export function catalogPaginationAfterIncompleteUpsert(opts: {
  startPage: number
  endPage: number
  maxPages: number
  limit: number
  rowsThisBatch: number
}): CatalogPaginationSlice & {
  reportId: string
  label: string
  rowsThisBatch: number
  maxPages: number
  limit: number
  startPage: number
  endPage: number
  nextPage: number
  hasMore: true
} {
  return {
    reportId: '0004',
    label: 'clientes',
    startPage: opts.startPage,
    endPage: opts.endPage,
    nextPage: opts.startPage,
    hasMore: true,
    rowsThisBatch: opts.rowsThisBatch,
    maxPages: opts.maxPages,
    limit: opts.limit,
  }
}
