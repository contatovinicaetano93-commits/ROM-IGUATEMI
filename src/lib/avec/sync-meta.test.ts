import { beforeEach, describe, expect, it, vi } from 'vitest'

const getLastAvecSync = vi.fn()

vi.mock('@/lib/avec/sync', () => ({
  getLastAvecSync: (...args: unknown[]) => getLastAvecSync(...args),
}))

vi.mock('@/lib/cache', () => ({
  cachedFetch: (_key: string, fn: () => Promise<unknown>) => fn(),
}))

function run(
  kind: 'fast' | 'full',
  minutesAgo: number,
  stage?: string,
  status: 'ok' | 'partial' | 'error' = 'ok',
) {
  return {
    id: `${kind}-${minutesAgo}`,
    kind,
    status,
    error: null,
    created_at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    stats: stage ? { stage } : {},
  }
}

describe('loadAvecSyncMeta (stage-aware)', () => {
  beforeEach(() => {
    getLastAvecSync.mockReset()
    vi.resetModules()
  })

  it('não marca stale só porque catalog é o full mais recente', async () => {
    getLastAvecSync.mockImplementation(async (kind: string, opts?: { stage?: string }) => {
      if (kind === 'fast') return run('fast', 10)
      if (kind === 'full' && opts?.stage === 'ops') return run('full', 60, 'ops')
      if (kind === 'full' && opts?.stage === 'agenda') return run('full', 45, 'agenda')
      if (kind === 'full' && opts?.stage === 'catalog') return run('full', 5, 'catalog')
      if (kind === 'full' && opts?.stage === 'all') return null
      return null
    })

    const { loadAvecSyncMeta } = await import('@/lib/avec/sync-meta')
    const meta = await loadAvecSyncMeta()
    expect(meta.stale).toBe(false)
    expect(meta.ops_stale).toBe(false)
    expect(meta.fast_stale).toBe(false)
    expect(meta.catalog_stale).toBe(false)
  })

  it('marca ops_stale quando P1/P2/P3 >24h mesmo com catalog fresco', async () => {
    getLastAvecSync.mockImplementation(async (kind: string, opts?: { stage?: string }) => {
      if (kind === 'fast') return run('fast', 10)
      if (kind === 'full' && opts?.stage === 'ops') return run('full', 60 * 30, 'ops')
      if (kind === 'full' && opts?.stage === 'agenda') return run('full', 60, 'agenda')
      if (kind === 'full' && opts?.stage === 'catalog') return run('full', 5, 'catalog')
      if (kind === 'full' && opts?.stage === 'all') return null
      return null
    })

    const { loadAvecSyncMeta } = await import('@/lib/avec/sync-meta')
    const meta = await loadAvecSyncMeta()
    expect(meta.ops_stale).toBe(true)
    expect(meta.stale).toBe(true)
    expect(meta.fast_stale).toBe(false)
  })

  it('usa full legado (stage=all) quando ops fatiado ainda não rodou', async () => {
    getLastAvecSync.mockImplementation(async (kind: string, opts?: { stage?: string }) => {
      if (kind === 'fast') return run('fast', 5)
      if (kind === 'full' && opts?.stage === 'all') return run('full', 30, 'all')
      return null
    })

    const { loadAvecSyncMeta } = await import('@/lib/avec/sync-meta')
    const meta = await loadAvecSyncMeta()
    expect(meta.ops_stale).toBe(false)
    expect(meta.ops_created_at).toBeTruthy()
    expect(meta.stale).toBe(false)
  })
})
