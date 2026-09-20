import { describe, expect, it } from 'vitest'
import { salonPaginationPlan, type AvecSyncRun } from '@/lib/avec/sync'

function runWithPagination(partial: AvecSyncRun['stats']['pagination']): AvecSyncRun {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    kind: 'full',
    status: 'partial',
    error: null,
    created_at: '2026-09-20T12:00:00.000Z',
    stats: {
      panel: 'iguatemi',
      deployment_host: null,
      clients_upserted: 0,
      appointments_synced: 0,
      attendances_synced: 0,
      services_created: 0,
      services_scheduled: 0,
      services_completed: 0,
      revenue_rows: 0,
      cancellation_rows: 0,
      snapshots_saved: 0,
      errors: [],
      warnings: [],
      pagination: partial,
    },
  }
}

describe('salonPaginationPlan', () => {
  it('retorna vazio sem pagination', () => {
    expect(salonPaginationPlan(null)).toEqual([])
  })

  it('marca lote pendente com nextPage', () => {
    const plan = salonPaginationPlan(
      runWithPagination({
        '0051': {
          reportId: '0051',
          label: 'agendamentos',
          startPage: 1,
          endPage: 80,
          nextPage: 81,
          hasMore: true,
          rowsThisBatch: 20000,
          maxPages: 80,
          limit: 250,
        },
      }),
    )
    expect(plan).toHaveLength(1)
    expect(plan[0]?.batchLabel).toBe('Próximas 81–160')
    expect(plan[0]?.hasMore).toBe(true)
  })

  it('lote completo sem hasMore', () => {
    const plan = salonPaginationPlan(
      runWithPagination({
        '0004': {
          reportId: '0004',
          label: 'clientes',
          startPage: 1,
          endPage: 12,
          nextPage: null,
          hasMore: false,
          rowsThisBatch: 3000,
          maxPages: 80,
          limit: 250,
        },
      }),
    )
    expect(plan[0]?.batchLabel).toBe('Páginas 1–12 sincronizadas')
  })
})
