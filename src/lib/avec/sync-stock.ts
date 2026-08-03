// Sync de Estoque — API-first: Avec é fonte da verdade (sem webhook, só pull/cron).
// fast: 0149 (saldo) + 0046 (alerta, já com sugestão de reposição da Avec).
// full: fast + 0044 (movimentos) + 0323 (enriquece origem) + valorização (0045/0242/0243/0142).
import { getSql } from '@/lib/db'
import { avecSiteParam } from '@/lib/brand'
import { SYNC_LOCK_KEYS, withSyncLock } from '@/lib/sync-lock'
import {
  fetchAllAvecReport,
  formatTruncationWarning,
  fmtAvecDate,
  getAvecSyncMaxPages,
  isAvecFetchAbortError,
  periodRange,
  AVEC_REPORT_LABELS,
  type AvecReportFetchResult,
  type AvecReportParams,
} from '@/lib/avec/client'
import {
  formatAvecErrorList,
  formatAvecUserMessage,
  hardAvecSyncWarnings,
  isAvecTokenExpiredError,
} from '@/lib/avec/messages'
import {
  normalizeStockPositionRow,
  normalizeStockAlertRow,
  normalizeStockMovementRow,
  normalizeStockPurchaseRow,
  type NormalizedStockMovement,
  type NormalizedStockPosition,
} from '@/lib/avec/normalize'
import { getStockReports, getFastStockReports, getFullStockReports } from '@/lib/avec/registry'
import { saveReportSnapshot } from '@/lib/avec/snapshots'
import {
  upsertStockProductFromPosition,
  applyStockAlert,
  loadStockProductNameIndex,
  resolveStaleStockAlerts,
  applyStockMovementsBatch,
  seedLocalStockAlertsFromCatalog,
  enrichMovementWithPurchaseOrigin,
} from '@/lib/stock'

export type StockSyncMode = 'fast' | 'full'

export interface StockReportPagination {
  reportId: string
  label: string
  startPage: number
  endPage: number
  nextPage: number | null
  hasMore: boolean
  rowsThisBatch: number
  maxPages: number
  limit: number
}

export interface StockSyncStats {
  positions_synced: number
  alerts_active: number
  alerts_resolved: number
  alerts_seeded_local: number
  movements_synced: number
  movements_skipped_duplicate: number
  purchases_enriched: number
  snapshots_saved: number
  errors: string[]
  warnings: string[]
  running?: boolean
  aborted?: boolean
  pagination?: Record<string, StockReportPagination>
}

export interface StockSyncRun {
  id: string
  kind: string
  status: 'ok' | 'error' | 'partial'
  stats: StockSyncStats
  error: string | null
  created_at: string
}

/** Fast estoque no cron Vercel (~300s): páginas curtas + orçamento de parede. (paridade BR) */
const STOCK_FAST_MAX_PAGES = 2
const STOCK_FAST_PAGE_LIMIT = 100
/** 200s: margem vs maxDuration 300s (upsert DB + 0046). */
const STOCK_FAST_BUDGET_MS = 200_000
/** 250s: margem vs maxDuration 300s e lock TTL 10min. */
const STOCK_FULL_BUDGET_MS = 250_000

function reportId(mapper: string): string | null {
  const def = getStockReports().find((r) => r.mapper === mapper)
  return def?.id ?? null
}

function recordReportPagination(stats: StockSyncStats, reportId: string, result: AvecReportFetchResult) {
  if (!stats.pagination) stats.pagination = {}
  stats.pagination[reportId] = {
    reportId,
    label: AVEC_REPORT_LABELS[reportId] ?? reportId,
    startPage: result.startPage,
    endPage: result.endPage,
    nextPage: result.nextPage,
    hasMore: result.hasMore,
    rowsThisBatch: result.rows.length,
    maxPages: result.maxPages,
    limit: result.limit,
  }
}

type StockPageOpts = {
  maxPages: number
  pageLimit: number
  deadlineAt: number | null
  /** Fast com teto baixo: truncamento é esperado, não vira warning. */
  expectTruncation?: boolean
  skipSnapshot?: boolean
  startPages?: Record<string, number>
}

async function beginRun(kind: string, stats: StockSyncStats): Promise<StockSyncRun> {
  const sql = getSql()
  // Abort limpo de runs mortos (timeout/kill do cron) — partial se houve progresso.
  await sql`
    update avec_sync_runs
    set
      status = case
        when coalesce((stats->>'positions_synced')::int, 0)
          + coalesce((stats->>'alerts_active')::int, 0)
          + coalesce((stats->>'movements_synced')::int, 0)
          + coalesce((stats->>'purchases_enriched')::int, 0) > 0
        then 'partial'
        else 'error'
      end,
      error = coalesce(nullif(error, ''), 'Sync estoque interrompido (timeout/kill)'),
      stats = coalesce(stats, '{}'::jsonb) || '{"running":false}'::jsonb
    where kind = ${kind}
      and coalesce(stats->>'running', 'false') = 'true'
  `
  const starting = { ...stats, running: true as const }
  const rows = (await sql`
    insert into avec_sync_runs (kind, status, stats)
    values (${kind}, 'partial', ${starting})
    returning *
  `) as StockSyncRun[]
  return rows[0]!
}

async function finishRun(
  id: string,
  status: StockSyncRun['status'],
  stats: StockSyncStats,
  error?: string
): Promise<StockSyncRun> {
  const sql = getSql()
  const finished = { ...stats, running: false as const }
  const rows = (await sql`
    update avec_sync_runs
    set status = ${status}, stats = ${finished}, error = ${error ?? null}
    where id = ${id}::uuid
    returning *
  `) as StockSyncRun[]
  return rows[0]!
}

export async function getLastStockSync(
  kind: 'stock_fast' | 'stock_full',
  opts?: { finishedOnly?: boolean },
): Promise<StockSyncRun | null> {
  const sql = getSql()
  const finishedOnly = opts?.finishedOnly === true
  const rows = finishedOnly
    ? ((await sql`
        select * from avec_sync_runs
        where kind = ${kind}
          and coalesce(stats->>'running', 'false') <> 'true'
        order by created_at desc
        limit 1
      `) as StockSyncRun[])
    : ((await sql`
        select * from avec_sync_runs where kind = ${kind} order by created_at desc limit 1
      `) as StockSyncRun[])
  return rows[0] ?? null
}

async function snapshotSafe(
  id: string,
  params: Record<string, unknown>,
  rows: Record<string, unknown>[],
  stats: StockSyncStats,
  syncRunId: string,
  keepPayload = false
) {
  try {
    await saveReportSnapshot(id, params, rows, syncRunId, { keepPayload, retain: 1 })
    stats.snapshots_saved++
  } catch (e) {
    stats.warnings.push(`snapshot ${id}: ${e instanceof Error ? e.message : String(e)}`)
  }
}

async function syncPositions(stats: StockSyncStats, syncRunId: string, opts: StockPageOpts) {
  const id = reportId('stock_position')
  if (!id) return
  if (opts.deadlineAt != null && Date.now() >= opts.deadlineAt) {
    stats.warnings.push('0149: pulado — orçamento de tempo esgotado')
    stats.aborted = true
    return
  }
  const params = {
    inicio: fmtAvecDate(new Date()),
    marca: '',
    linha: '',
    local: '',
    categoria: '',
    limit: opts.pageLimit,
    site: avecSiteParam(),
  }
  try {
    const startPage = opts.startPages?.[id] ?? 1
    const result = await fetchAllAvecReport(id, params, opts.maxPages, {
      deadlineAt: opts.deadlineAt,
      startPage,
    })
    recordReportPagination(stats, id, result)
    if (result.truncated && !opts.expectTruncation) {
      stats.warnings.push(formatTruncationWarning(id, result))
    }
    if (opts.deadlineAt != null && Date.now() >= opts.deadlineAt && result.rows.length === 0) {
      stats.aborted = true
      stats.warnings.push('0149: orçamento esgotado durante fetch (abort limpo)')
      return
    }
    if (
      opts.expectTruncation &&
      result.truncated &&
      result.rows.length > 0 &&
      opts.deadlineAt != null &&
      Date.now() >= opts.deadlineAt
    ) {
      stats.aborted = true
      stats.warnings.push(
        `0149: fetch parcial (${result.pagesFetched} pág., ${result.rows.length} linhas) — abort limpo`,
      )
    }
    if (!opts.skipSnapshot) {
      await snapshotSafe(id, params, result.rows, stats, syncRunId)
    }

    const positions: NormalizedStockPosition[] = []
    for (const row of result.rows) {
      const pos = normalizeStockPositionRow(row)
      if (pos) positions.push(pos)
    }
    // Upserts em paralelo (chunks) — N sequencial com ~5 round-trips/SKU estoura maxDuration.
    const CHUNK = 25
    for (let i = 0; i < positions.length; i += CHUNK) {
      if (opts.deadlineAt != null && Date.now() >= opts.deadlineAt) {
        stats.aborted = true
        stats.warnings.push(
          `0149: orçamento esgotado após ${stats.positions_synced} posições (abort limpo)`,
        )
        break
      }
      const chunk = positions.slice(i, i + CHUNK)
      await Promise.all(chunk.map((pos) => upsertStockProductFromPosition(pos)))
      stats.positions_synced += chunk.length
    }
    if (result.rows.length > 5 && positions.length < result.rows.length * 0.5) {
      stats.warnings.push(
        `0149: só ${positions.length}/${result.rows.length} linhas reconhecidas — possível mudança no formato do relatório`,
      )
    }
  } catch (e) {
    if (isAvecFetchAbortError(e)) {
      stats.aborted = true
      stats.warnings.push(
        `0149: timeout/abort limpo — ${e instanceof Error ? e.message : String(e)}`,
      )
      return
    }
    stats.errors.push(`0149 (posição): ${e instanceof Error ? e.message : String(e)}`)
  }
}

async function syncAlerts(stats: StockSyncStats, syncRunId: string, opts: StockPageOpts) {
  const id = reportId('stock_alert')
  if (!id) return
  if (opts.deadlineAt != null && Date.now() >= opts.deadlineAt) {
    stats.warnings.push('0046: pulado — orçamento de tempo esgotado')
    stats.aborted = true
    return
  }
  const params = { site: avecSiteParam(), limit: opts.pageLimit }
  try {
    const startPage = opts.startPages?.[id] ?? 1
    const result = await fetchAllAvecReport(id, params, opts.maxPages, {
      deadlineAt: opts.deadlineAt,
      startPage,
    })
    recordReportPagination(stats, id, result)
    if (result.truncated && !opts.expectTruncation) {
      stats.warnings.push(formatTruncationWarning(id, result))
    }
    if (!opts.skipSnapshot) {
      await snapshotSafe(id, params, result.rows, stats, syncRunId)
    }

    // 1 query de catálogo — evita SELECT * em stock_products por cada linha do 0046.
    const productNameIndex = await loadStockProductNameIndex()
    const seenAvecProductIds: string[] = []
    let active = 0
    for (const row of result.rows) {
      if (opts.deadlineAt != null && Date.now() >= opts.deadlineAt) {
        stats.aborted = true
        stats.warnings.push(
          `0046: orçamento esgotado após ${active} alertas (abort limpo)`,
        )
        break
      }
      const alert = normalizeStockAlertRow(row)
      if (!alert) continue
      const applied = await applyStockAlert(alert, { productNameIndex })
      if (!applied) continue
      seenAvecProductIds.push(applied.avecProductId)
      active++
    }
    stats.alerts_active = active
    // Só resolve stale quando o match funcionou (active>0) ou o relatório veio
    // vazio de verdade — se 0046 trouxe linhas e nenhuma aplicou, não zera alertas.
    // Fast com teto baixo (2 págs) quase sempre tem hasMore — não acender banner.
    // Full/continue truncado: avisa e deixa a UI oferecer o próximo lote.
    if (result.hasMore) {
      if (!opts.expectTruncation) {
        stats.warnings.push(
          '0046: truncado — alertas stale NÃO resolvidos (evita limpar alertas das páginas omitidas)',
        )
      }
    } else if (active > 0 || result.rows.length === 0) {
      stats.alerts_resolved = await resolveStaleStockAlerts(seenAvecProductIds)
    }

    // 0046 vazio/timeout recorrente no IG: materializa alertas do catálogo 0149
    // (current_qty <= minimum_qty) para Cérebro/ROM Estoque não ficarem cegos.
    if (active === 0) {
      const seeded = await seedLocalStockAlertsFromCatalog()
      stats.alerts_seeded_local = seeded
      if (seeded > 0) {
        stats.alerts_active = seeded
        stats.warnings.push(
          `0046 vazio — ${seeded} alertas locais a partir do catálogo (qty ≤ mínimo)`,
        )
      }
    }
  } catch (e) {
    if (isAvecFetchAbortError(e)) {
      stats.aborted = true
      stats.warnings.push(
        `0046: timeout/abort limpo — ${e instanceof Error ? e.message : String(e)}`,
      )
      try {
        const seeded = await seedLocalStockAlertsFromCatalog()
        stats.alerts_seeded_local = seeded
        if (seeded > 0) {
          stats.alerts_active = seeded
          stats.warnings.push(
            `0046 abort — ${seeded} alertas locais a partir do catálogo (qty ≤ mínimo)`,
          )
        }
      } catch {
        /* ignore */
      }
      return
    }
    stats.errors.push(`0046 (alertas): ${e instanceof Error ? e.message : String(e)}`)
    try {
      const seeded = await seedLocalStockAlertsFromCatalog()
      stats.alerts_seeded_local = seeded
      if (seeded > 0) {
        stats.alerts_active = seeded
        stats.warnings.push(
          `0046 falhou — ${seeded} alertas locais a partir do catálogo (qty ≤ mínimo)`,
        )
      }
    } catch (seedErr) {
      stats.warnings.push(
        `seed alertas locais: ${seedErr instanceof Error ? seedErr.message : String(seedErr)}`,
      )
    }
  }
}

async function syncMovements(
  stats: StockSyncStats,
  syncRunId: string,
  deadlineAt: number | null,
  startPages?: Record<string, number>,
) {
  const { inicio, fim } = periodRange(3, 0)
  await syncMovementsDateRange(stats, syncRunId, inicio, fim, deadlineAt, startPages)
}

/**
 * 0044 movimentos em intervalo BR (dd/mm/yyyy) — backfill CMV do Financeiro.
 */
export async function syncMovementsDateRange(
  stats: StockSyncStats,
  syncRunId: string | undefined,
  inicioBr: string,
  fimBr: string,
  deadlineAt: number | null = null,
  startPages?: Record<string, number>,
) {
  const id = reportId('stock_movement')
  if (!id) return
  if (deadlineAt != null && Date.now() >= deadlineAt) {
    stats.warnings.push('0044: pulado — orçamento de tempo esgotado')
    stats.aborted = true
    return
  }
  const params = { inicio: inicioBr, fim: fimBr, site: avecSiteParam(), limit: 250 }
  try {
    const startPage = startPages?.[id] ?? 1
    const result = await fetchAllAvecReport(id, params, undefined, { deadlineAt, startPage })
    recordReportPagination(stats, id, result)
    if (result.truncated) stats.warnings.push(formatTruncationWarning(id, result))
    if (deadlineAt != null && Date.now() >= deadlineAt && result.rows.length === 0) {
      stats.aborted = true
      stats.warnings.push('0044: orçamento esgotado durante fetch (abort limpo)')
      return
    }
    if (syncRunId) await snapshotSafe(id, params, result.rows, stats, syncRunId)
    if (deadlineAt != null && Date.now() >= deadlineAt) {
      stats.aborted = true
      stats.warnings.push('0044: orçamento esgotado antes de aplicar movimentos (abort limpo)')
      return
    }

    const normalized: NormalizedStockMovement[] = []
    for (const row of result.rows) {
      const mv = normalizeStockMovementRow(row)
      if (mv) normalized.push(mv)
    }
    const applied = await applyStockMovementsBatch(normalized, 'avec_0044')
    stats.movements_synced += applied.synced
    stats.movements_skipped_duplicate += applied.skipped
  } catch (e) {
    stats.errors.push(`0044 (movimentos ${inicioBr}–${fimBr}): ${e instanceof Error ? e.message : String(e)}`)
  }
}

async function syncPurchaseOrigin(
  stats: StockSyncStats,
  syncRunId: string,
  deadlineAt: number | null,
  startPages?: Record<string, number>,
) {
  const id = reportId('stock_purchase')
  if (!id) return
  if (deadlineAt != null && Date.now() >= deadlineAt) {
    stats.warnings.push('0323: pulado — orçamento de tempo esgotado')
    stats.aborted = true
    return
  }
  const { inicio, fim } = periodRange(3, 0)
  const params = { inicio, fim, site: avecSiteParam(), limit: 250 }
  try {
    const startPage = startPages?.[id] ?? 1
    const result = await fetchAllAvecReport(id, params, undefined, { deadlineAt, startPage })
    recordReportPagination(stats, id, result)
    if (result.truncated) stats.warnings.push(formatTruncationWarning(id, result))
    if (deadlineAt != null && Date.now() >= deadlineAt && result.rows.length === 0) {
      stats.aborted = true
      stats.warnings.push('0323: orçamento esgotado durante fetch (abort limpo)')
      return
    }
    await snapshotSafe(id, params, result.rows, stats, syncRunId)

    for (const row of result.rows) {
      if (deadlineAt != null && Date.now() >= deadlineAt) {
        stats.aborted = true
        stats.warnings.push(
          `0323: orçamento esgotado após ${stats.purchases_enriched} compras (abort limpo)`,
        )
        break
      }
      const purchase = normalizeStockPurchaseRow(row)
      if (!purchase) continue
      const enriched = await enrichMovementWithPurchaseOrigin(purchase)
      if (enriched) stats.purchases_enriched++
    }
  } catch (e) {
    stats.errors.push(`0323 (origem compra): ${e instanceof Error ? e.message : String(e)}`)
  }
}

/** Valorização (0045/0242/0243/0142) — snapshot com payload (único caso que a UI ainda lê). */
async function syncValuation(
  stats: StockSyncStats,
  syncRunId: string,
  deadlineAt: number | null,
  startPages?: Record<string, number>,
) {
  const site = avecSiteParam()
  const jobs: { mapper: string; params: AvecReportParams }[] = [
    { mapper: 'stock_valuation_total', params: { tipo_produto: 'Todos', site, limit: 250 } },
    { mapper: 'stock_valuation_category', params: { site, limit: 250 } },
    { mapper: 'stock_valuation_brand', params: { site, limit: 250 } },
    { mapper: 'stock_valuation_category_pct', params: { ...periodRange(30, 0), site, limit: 250 } },
  ]
  for (const job of jobs) {
    const id = reportId(job.mapper)
    if (!id) continue
    if (deadlineAt != null && Date.now() >= deadlineAt) {
      stats.warnings.push(`${id}: pulado — orçamento de tempo esgotado`)
      stats.aborted = true
      return
    }
    try {
      const startPage = startPages?.[id] ?? 1
      const result = await fetchAllAvecReport(id, job.params, undefined, { deadlineAt, startPage })
      recordReportPagination(stats, id, result)
      if (result.truncated) stats.warnings.push(formatTruncationWarning(id, result))
      if (deadlineAt != null && Date.now() >= deadlineAt && result.rows.length === 0) {
        stats.aborted = true
        stats.warnings.push(`${id}: orçamento esgotado durante fetch (abort limpo)`)
        return
      }
      await snapshotSafe(id, job.params, result.rows, stats, syncRunId, true)
    } catch (e) {
      stats.errors.push(`${id} (valorização): ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}

function emptyStats(): StockSyncStats {
  return {
    positions_synced: 0,
    alerts_active: 0,
    alerts_resolved: 0,
    alerts_seeded_local: 0,
    movements_synced: 0,
    movements_skipped_duplicate: 0,
    purchases_enriched: 0,
    snapshots_saved: 0,
    errors: [],
    warnings: [],
  }
}

/**
 * full é um superset de fast (mesmo padrão de runAvecSync): sempre sincroniza
 * saldo+alerta; só busca movimentos/compras/valorização em full — evita gap
 * de saldo desatualizado entre os dois modos.
 */
export type StockSyncContinueOpts = {
  continueFrom?: Record<string, number> | 'auto'
}

export async function runStockSync(
  mode: StockSyncMode = 'fast',
  opts?: StockSyncContinueOpts,
): Promise<StockSyncRun> {
  return withSyncLock(SYNC_LOCK_KEYS.stock, () => runStockSyncUnlocked(mode, opts), {
    ttlMs: 10 * 60 * 1000,
    owner: `stock-${mode}`,
  })
}

async function resolveContinueStartPages(
  continueFrom: Record<string, number> | 'auto' | undefined,
): Promise<Record<string, number>> {
  if (!continueFrom) return {}
  if (continueFrom !== 'auto') return continueFrom
  const [full, fast] = await Promise.all([
    getLastStockSync('stock_full', { finishedOnly: true }),
    getLastStockSync('stock_fast', { finishedOnly: true }),
  ])
  const plan = stockPaginationPlan(full)
  const source = plan.length > 0 ? full : stockPaginationPlan(fast).length > 0 ? fast : null
  if (!source?.stats?.pagination) return {}
  const pages: Record<string, number> = {}
  for (const entry of Object.values(source.stats.pagination)) {
    if (entry.hasMore && entry.nextPage != null) {
      pages[entry.reportId] = entry.nextPage
    }
  }
  return pages
}

async function runStockSyncUnlocked(
  mode: StockSyncMode,
  opts?: StockSyncContinueOpts,
): Promise<StockSyncRun> {
  const isContinue = opts?.continueFrom !== undefined
  const effectiveMode: StockSyncMode = isContinue ? 'full' : mode
  const kind = effectiveMode === 'full' ? 'stock_full' : 'stock_fast'
  const stats = emptyStats()
  const run = await beginRun(kind, stats)
  const deadlineAt =
    Date.now() + (effectiveMode === 'fast' ? STOCK_FAST_BUDGET_MS : STOCK_FULL_BUDGET_MS)
  const startPages = await resolveContinueStartPages(opts?.continueFrom)
  const pageOpts: StockPageOpts = {
    maxPages: isContinue
      ? getAvecSyncMaxPages()
      : effectiveMode === 'fast'
        ? STOCK_FAST_MAX_PAGES
        : 40,
    pageLimit: isContinue ? 250 : effectiveMode === 'fast' ? STOCK_FAST_PAGE_LIMIT : 250,
    deadlineAt,
    expectTruncation: effectiveMode === 'fast' && !isContinue,
    skipSnapshot: effectiveMode === 'fast' && !isContinue,
    startPages,
  }

  try {
    // Alertas (0046) + seed local antes de 0149 — Cérebro lê stock_alerts;
    // posição é pesada e não pode matar o ciclo antes.
    await syncAlerts(stats, run.id, pageOpts)
    await syncPositions(stats, run.id, pageOpts)

    if (effectiveMode === 'full') {
      await syncMovements(stats, run.id, deadlineAt, startPages)
      await syncPurchaseOrigin(stats, run.id, deadlineAt, startPages)
      await syncValuation(stats, run.id, deadlineAt, startPages)
    }

    stats.errors = formatAvecErrorList(stats.errors)

    const hardWarnings = hardAvecSyncWarnings(stats.warnings)
    const hadAnyData =
      stats.positions_synced > 0 ||
      stats.movements_synced > 0 ||
      stats.alerts_active > 0 ||
      stats.alerts_seeded_local > 0
    const status: StockSyncRun['status'] =
      stats.errors.length > 0 && !hadAnyData
        ? 'error'
        : stats.errors.length > 0 || hardWarnings.length > 0 || stats.aborted
          ? 'partial'
          : 'ok'

    const authErr = stats.errors.find((e) => isAvecTokenExpiredError(e))
    const abortMsg = stats.aborted
      ? (stats.warnings.find((w) => /orçamento|abort|timeout/i.test(w)) ??
        'Sync estoque abortado por orçamento de tempo (evita timeout/kill)')
      : null
    // Abort limpo com dados parciais: partial + warning, sem error (Cérebro/Diagnóstico).
    const topError =
      status === 'error'
        ? (authErr ?? formatAvecUserMessage(stats.errors[0]) ?? stats.errors[0] ?? undefined)
        : (authErr ??
          (stats.aborted && !hadAnyData ? abortMsg : undefined) ??
          undefined)

    return await finishRun(run.id, status, stats, topError)
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e)
    const msg = formatAvecUserMessage(raw) ?? raw
    stats.errors.push(msg)
    // Progresso checkpointado / abort → partial (paridade Avec catch).
    const hadAnyData =
      stats.positions_synced > 0 ||
      stats.movements_synced > 0 ||
      stats.alerts_active > 0 ||
      stats.alerts_seeded_local > 0
    const status: StockSyncRun['status'] =
      hadAnyData || Boolean(stats.aborted) ? 'partial' : 'error'
    return await finishRun(run.id, status, stats, msg)
  }
}

/** Usado pela UI de onboarding/observabilidade — quais relatórios de estoque existem em cada camada. */
export function describeStockSyncPlan() {
  return {
    fast: getFastStockReports().map((r) => ({ id: r.id, name: r.name })),
    full: getFullStockReports().map((r) => ({ id: r.id, name: r.name })),
    batchSize: getAvecSyncMaxPages(),
  }
}

export type StockPaginationPlanItem = StockReportPagination & { batchLabel: string }

export function stockPaginationPlan(lastRun: StockSyncRun | null): StockPaginationPlanItem[] {
  if (!lastRun?.stats?.pagination) return []
  return Object.values(lastRun.stats.pagination).map((entry) => ({
    ...entry,
    batchLabel:
      entry.hasMore && entry.nextPage != null
        ? `Próximas ${entry.nextPage}–${entry.nextPage + entry.maxPages - 1}`
        : `Páginas ${entry.startPage}–${entry.endPage} sincronizadas`,
  }))
}

/**
 * Prefere full com lote pendente. Fast horário corta 0046 de propósito (2 págs) —
 * não expor isso como “continue” quando já existe um full (evita banner eterno).
 */
export function pickStockPaginationPlan(
  full: StockSyncRun | null,
  fast: StockSyncRun | null,
): StockPaginationPlanItem[] {
  const fullPlan = stockPaginationPlan(full)
  const fastPlan = stockPaginationPlan(fast)
  if (fullPlan.some((p) => p.hasMore)) return fullPlan
  // Full sem pendência: não deixar o fast horário “ressuscitar” o banner.
  if (fullPlan.length > 0) return fullPlan
  if (fastPlan.some((p) => p.hasMore)) return fastPlan
  return fastPlan
}
