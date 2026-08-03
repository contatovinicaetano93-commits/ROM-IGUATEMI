import { describe, expect, it } from 'vitest'
import { stockPaginationPlan, type StockSyncRun } from '@/lib/avec/sync-stock'

describe('stockPaginationPlan', () => {
  it('retorna vazio sem pagination no último run', () => {
    expect(stockPaginationPlan(null)).toEqual([])
    expect(stockPaginationPlan({ id: '1', kind: 'stock_full', status: 'ok', stats: { errors: [], warnings: [] } as StockSyncRun['stats'], error: null, created_at: '' })).toEqual([])
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
})
