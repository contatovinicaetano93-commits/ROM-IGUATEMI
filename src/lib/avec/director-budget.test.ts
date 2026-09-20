import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/avec/client', () => ({
  extractRows: () => [],
  fetchAvecReport: vi.fn(),
  fmtAvecDate: (d: Date) =>
    `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`,
}))

vi.mock('@/lib/db', () => ({
  getSql: () => vi.fn(),
}))

vi.mock('@/lib/director-report/from-db', () => ({
  getVisitCoverage: vi.fn(async () => null),
  isVisitCoverageReady: () => false,
  get0021MonthCoverage: vi.fn(async () => null),
  is0021MonthCoverageReady: () => false,
}))

describe('director budget abort hooks', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('director-visits para no shouldAbort antes do trimestre', async () => {
    const { syncDirectorVisits } = await import('./sync-director-visits')
    const stats = {
      panel: 'iguatemi' as const,
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
      errors: [] as string[],
      warnings: [] as string[],
    }
    await syncDirectorVisits(stats, undefined, {
      quarters: ['2026-Q1', '2026-Q2'],
      force: true,
      shouldAbort: () => true,
    })
    expect(stats.aborted).toBe(true)
    expect(stats.warnings.some((w) => /orçamento/i.test(w))).toBe(true)
  })

  it('director-0021 para no shouldAbort antes do mês', async () => {
    const { syncDirector0021 } = await import('./sync-director-0021')
    const stats = {
      panel: 'iguatemi' as const,
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
      errors: [] as string[],
      warnings: [] as string[],
    }
    await syncDirector0021(stats, undefined, {
      months: ['2026-01', '2026-02'],
      force: true,
      shouldAbort: () => true,
    })
    expect(stats.aborted).toBe(true)
    expect(stats.warnings.some((w) => /orçamento/i.test(w))).toBe(true)
  })
})
