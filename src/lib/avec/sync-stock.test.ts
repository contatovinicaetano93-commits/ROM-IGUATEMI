import { describe, expect, it } from 'vitest'
import {
  pickStockPaginationPlan,
  stockPaginationPlan,
  type StockSyncRun,
} from '@/lib/avec/sync-stock'

describe('stockPaginationPlan', () => {
  it('retorna vazio sem pagination no último run', () => {
    expect(stockPaginationPlan(null)).toEqual([])
    expect(stockPaginationPlan({ id: '1', kind: 'stock_full', status: 'ok', stats: { errors: [], warnings: [] } as unknown as StockSyncRun['stats'], error: null, created_at: '' })).toEqual([])
  })

  it('monta batchLabel para lote completo e pendente', () => {
    const run: StockSyncRun = {
      id: '1',
      kind: 'stock_full',
      status: 'partial',
      error: null,
      created_at: '2026-08-03T00:00:00Z',
      stats: {
        positions_synced: 100,
        alerts_active: 10,
        alerts_resolved: 0,
        alerts_seeded_local: 0,
        movements_synced: 0,
        movements_skipped_duplicate: 0,
        purchases_enriched: 0,
        snapshots_saved: 2,
        errors: [],
        warnings: [],
        pagination: {
          '0046': {
            reportId: '0046',
            label: 'alertas de estoque',
            startPage: 1,
            endPage: 200,
            nextPage: 201,
            hasMore: true,
            rowsThisBatch: 50000,
            maxPages: 200,
            limit: 250,
          },
          '0149': {
            reportId: '0149',
            label: 'posição de estoque',
            startPage: 1,
            endPage: 50,
            nextPage: null,
            hasMore: false,
            rowsThisBatch: 12000,
            maxPages: 200,
            limit: 250,
          },
        },
      },
    }

    const plan = stockPaginationPlan(run)
    expect(plan).toHaveLength(2)
    const alerts = plan.find((p) => p.reportId === '0046')
    const positions = plan.find((p) => p.reportId === '0149')
    expect(alerts?.batchLabel).toBe('Próximas 201–400')
    expect(positions?.batchLabel).toBe('Páginas 1–50 sincronizadas')
  })

  it('pickStockPaginationPlan ignora hasMore do fast quando full já existe', () => {
    const fullDone: StockSyncRun = {
      id: 'full',
      kind: 'stock_full',
      status: 'ok',
      error: null,
      created_at: '2026-08-03T12:00:00Z',
      stats: {
        positions_synced: 1,
        alerts_active: 1,
        alerts_resolved: 0,
        alerts_seeded_local: 0,
        movements_synced: 0,
        movements_skipped_duplicate: 0,
        purchases_enriched: 0,
        snapshots_saved: 0,
        errors: [],
        warnings: [],
        pagination: {
          '0149': {
            reportId: '0149',
            label: 'posição',
            startPage: 1,
            endPage: 10,
            nextPage: null,
            hasMore: false,
            rowsThisBatch: 100,
            maxPages: 40,
            limit: 250,
          },
        },
      },
    }
    const fastPending: StockSyncRun = {
      id: 'fast',
      kind: 'stock_fast',
      status: 'ok',
      error: null,
      created_at: '2026-08-03T13:00:00Z',
      stats: {
        positions_synced: 1,
        alerts_active: 1,
        alerts_resolved: 0,
        alerts_seeded_local: 0,
        movements_synced: 0,
        movements_skipped_duplicate: 0,
        purchases_enriched: 0,
        snapshots_saved: 0,
        errors: [],
        warnings: [],
        pagination: {
          '0046': {
            reportId: '0046',
            label: 'alertas',
            startPage: 1,
            endPage: 2,
            nextPage: 3,
            hasMore: true,
            rowsThisBatch: 200,
            maxPages: 2,
            limit: 100,
          },
        },
      },
    }
    const plan = pickStockPaginationPlan(fullDone, fastPending)
    expect(plan[0]?.reportId).toBe('0149')
    expect(plan.some((p) => p.hasMore)).toBe(false)
  })
})
