// Sync de Estoque — API-first: Avec é fonte da verdade (sem webhook, só pull/cron).
// fast: 0149 (saldo) + 0046 (alerta, já com sugestão de reposição da Avec).
// full: fast + 0044 (movimentos) + 0323 (enriquece origem) + valorização (0045/0242/0243/0142).
import { getSql } from '@/lib/db'
import { SYNC_LOCK_KEYS, withSyncLock } from '@/lib/sync-lock'
import {
  fetchAllAvecReport,
  formatTruncationWarning,
  fmtAvecDate,
  periodRange,
  type AvecReportParams,
} from '@/lib/avec/client'
import {
  normalizeStockPositionRow,
  normalizeStockAlertRow,
  normalizeStockMovementRow,
  normalizeStockPurchaseRow,
} from '@/lib/avec/normalize'
import { getStockReports, getFastStockReports, getFullStockReports } from '@/lib/avec/registry'
import { saveReportSnapshot } from '@/lib/avec/snapshots'
import {
  upsertStockProductFromPosition,
  applyStockAlert,
  resolveStaleStockAlerts,
  applyStockMovement,
  enrichMovementWithPurchaseOrigin,
} from '@/lib/stock'

export type StockSyncMode = 'fast' | 'full'

export interface StockSyncStats {
  positions_synced: number
  alerts_active: number
  alerts_resolved: number
  movements_synced: number
  movements_skipped_duplicate: number
  purchases_enriched: number
  snapshots_saved: number
  errors: string[]
  warnings: string[]
}

export interface StockSyncRun {
  id: string
  kind: string
  status: 'ok' | 'error' | 'partial'
  stats: StockSyncStats
  error: string | null
  created_at: string
}

function reportId(mapper: string): string | null {
  const def = getStockReports().find((r) => r.mapper === mapper)
  return def?.id ?? null
}

async function beginRun(kind: string, stats: StockSyncStats): Promise<StockSyncRun> {
  const sql = getSql()
  const rows = (await sql`
    insert into avec_sync_runs (kind, status, stats)
    values (${kind}, 'partial', ${JSON.stringify(stats)}::jsonb)
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
  const rows = (await sql`
    update avec_sync_runs
    set status = ${status}, stats = ${JSON.stringify(stats)}::jsonb, error = ${error ?? null}
    where id = ${id}::uuid
    returning *
  `) as StockSyncRun[]
  return rows[0]!
}

export async function getLastStockSync(kind: 'stock_fast' | 'stock_full'): Promise<StockSyncRun | null> {
  const sql = getSql()
  const rows = (await sql`
    select * from avec_sync_runs where kind = ${kind} order by created_at desc limit 1
  `) as StockSyncRun[]
  return rows[0] ?? null
}

async function snapshotSafe(
  id: string,
  params: Record<string, unknown>,
  rows: Record<string, unknown>[],
  stats: StockSyncStats,
  syncRunId: string
) {
  try {
    await saveReportSnapshot(id, params, rows, syncRunId)
    stats.snapshots_saved++
  } catch (e) {
    stats.warnings.push(`snapshot ${id}: ${e instanceof Error ? e.message : String(e)}`)
  }
}

async function syncPositions(stats: StockSyncStats, syncRunId: string) {
  const id = reportId('stock_position')
  if (!id) return
  const params = { inicio: fmtAvecDate(new Date()), marca: '', linha: '', categoria: '', limit: 250 }
  try {
    const result = await fetchAllAvecReport(id, params)
    if (result.truncated) stats.warnings.push(formatTruncationWarning(id, result))
    await snapshotSafe(id, params, result.rows, stats, syncRunId)

    let parsedCount = 0
    for (const row of result.rows) {
      const pos = normalizeStockPositionRow(row)
      if (!pos) continue
      parsedCount++
      await upsertStockProductFromPosition(pos)
      stats.positions_synced++
    }
    // Se a Avec devolveu linhas mas quase nada foi reconhecido, o formato do
    // relatório provavelmente mudou — sinaliza em vez de falhar em silêncio.
    if (result.rows.length > 5 && parsedCount < result.rows.length * 0.5) {
      stats.warnings.push(
        `0149: só ${parsedCount}/${result.rows.length} linhas reconhecidas — possível mudança no formato do relatório`
      )
    }
  } catch (e) {
    stats.errors.push(`0149 (posição): ${e instanceof Error ? e.message : String(e)}`)
  }
}

async function syncAlerts(stats: StockSyncStats, syncRunId: string) {
  const id = reportId('stock_alert')
  if (!id) return
  const params = { limit: 250 }
  try {
    const result = await fetchAllAvecReport(id, params)
    if (result.truncated) stats.warnings.push(formatTruncationWarning(id, result))
    await snapshotSafe(id, params, result.rows, stats, syncRunId)

    const seenAvecProductIds: string[] = []
    for (const row of result.rows) {
      const alert = normalizeStockAlertRow(row)
      if (!alert) continue
      await applyStockAlert(alert)
      seenAvecProductIds.push(alert.avecProductId)
    }
    stats.alerts_active = seenAvecProductIds.length
    stats.alerts_resolved = await resolveStaleStockAlerts(seenAvecProductIds)
  } catch (e) {
    stats.errors.push(`0046 (alertas): ${e instanceof Error ? e.message : String(e)}`)
  }
}

async function syncMovements(stats: StockSyncStats, syncRunId: string) {
  const id = reportId('stock_movement')
  if (!id) return
  // Janela com sobreposição (3 dias) — reprocessar não duplica (dedup por
  // produto+tipo+quantidade+data+origem em applyStockMovement).
  const { inicio, fim } = periodRange(3, 0)
  const params = { inicio, fim, limit: 250 }
  try {
    const result = await fetchAllAvecReport(id, params)
    if (result.truncated) stats.warnings.push(formatTruncationWarning(id, result))
    await snapshotSafe(id, params, result.rows, stats, syncRunId)

    for (const row of result.rows) {
      const mv = normalizeStockMovementRow(row)
      if (!mv) continue
      const inserted = await applyStockMovement(mv, 'avec_0044')
      if (inserted) stats.movements_synced++
      else stats.movements_skipped_duplicate++
    }
  } catch (e) {
    stats.errors.push(`0044 (movimentos): ${e instanceof Error ? e.message : String(e)}`)
  }
}

async function syncPurchaseOrigin(stats: StockSyncStats, syncRunId: string) {
  const id = reportId('stock_purchase')
  if (!id) return
  const { inicio, fim } = periodRange(3, 0)
  const params = { inicio, fim, limit: 250 }
  try {
    const result = await fetchAllAvecReport(id, params)
    if (result.truncated) stats.warnings.push(formatTruncationWarning(id, result))
    await snapshotSafe(id, params, result.rows, stats, syncRunId)

    for (const row of result.rows) {
      const purchase = normalizeStockPurchaseRow(row)
      if (!purchase) continue
      const enriched = await enrichMovementWithPurchaseOrigin(purchase)
      if (enriched) stats.purchases_enriched++
    }
  } catch (e) {
    stats.errors.push(`0323 (origem compra): ${e instanceof Error ? e.message : String(e)}`)
  }
}

/** Valorização (0045/0242/0243/0142) — só snapshot bruto; normalização acontece na leitura (stock.ts). */
async function syncValuation(stats: StockSyncStats, syncRunId: string) {
  const jobs: { mapper: string; params: AvecReportParams }[] = [
    { mapper: 'stock_valuation_total', params: { tipo_produto: 'Todos', limit: 250 } },
    { mapper: 'stock_valuation_category', params: { limit: 250 } },
    { mapper: 'stock_valuation_brand', params: { limit: 250 } },
    { mapper: 'stock_valuation_category_pct', params: { ...periodRange(30, 0), limit: 250 } },
  ]
  for (const job of jobs) {
    const id = reportId(job.mapper)
    if (!id) continue
    try {
      const result = await fetchAllAvecReport(id, job.params)
      if (result.truncated) stats.warnings.push(formatTruncationWarning(id, result))
      await snapshotSafe(id, job.params, result.rows, stats, syncRunId)
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
export async function runStockSync(mode: StockSyncMode = 'fast'): Promise<StockSyncRun> {
  return withSyncLock(SYNC_LOCK_KEYS.stock, () => runStockSyncUnlocked(mode), {
    ttlMs: 6 * 60 * 1000,
    owner: `stock-${mode}`,
  })
}

async function runStockSyncUnlocked(mode: StockSyncMode): Promise<StockSyncRun> {
  const kind = mode === 'full' ? 'stock_full' : 'stock_fast'
  const stats = emptyStats()
  const run = await beginRun(kind, stats)

  try {
    await syncPositions(stats, run.id)
    await syncAlerts(stats, run.id)

    if (mode === 'full') {
      await syncMovements(stats, run.id)
      await syncPurchaseOrigin(stats, run.id)
      await syncValuation(stats, run.id)
    }

    const hadAnyData = stats.positions_synced > 0 || stats.movements_synced > 0
    const status: StockSyncRun['status'] =
      stats.errors.length > 0 && !hadAnyData
        ? 'error'
        : stats.errors.length > 0 || stats.warnings.length > 0
          ? 'partial'
          : 'ok'

    return await finishRun(run.id, status, stats)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    stats.errors.push(msg)
    return await finishRun(run.id, 'error', stats, msg)
  }
}

/** Usado pela UI de onboarding/observabilidade — quais relatórios de estoque existem em cada camada. */
export function describeStockSyncPlan() {
  return {
    fast: getFastStockReports().map((r) => ({ id: r.id, name: r.name })),
    full: getFullStockReports().map((r) => ({ id: r.id, name: r.name })),
  }
}
