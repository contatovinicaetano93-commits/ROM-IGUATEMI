import { beforeEach, describe, expect, it, vi } from 'vitest'

const sqlMock = vi.fn()

vi.mock('@/lib/db', () => ({
  getSql: () => sqlMock,
}))

describe('withSyncLock', () => {
  beforeEach(() => {
    sqlMock.mockReset()
    vi.resetModules()
  })

  it('adquire lock, executa fn e libera', async () => {
    sqlMock
      .mockResolvedValueOnce(undefined) // create table
      .mockResolvedValueOnce(undefined) // create index
      .mockResolvedValueOnce([{ key: 'avec_sync' }]) // acquire
      .mockResolvedValueOnce(undefined) // release

    const { withSyncLock, SYNC_LOCK_KEYS } = await import('./sync-lock')
    const result = await withSyncLock(SYNC_LOCK_KEYS.avec, async () => 42, { owner: 'test-1' })

    expect(result).toBe(42)
    expect(sqlMock).toHaveBeenCalled()
  })

  it('lança SyncLockBusyError quando lock está ativo', async () => {
    sqlMock
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([]) // acquire failed
      .mockResolvedValueOnce([{ owner: 'other', expires_at: '2026-07-17T21:00:00Z' }])

    const { withSyncLock, SYNC_LOCK_KEYS, SyncLockBusyError, isSyncLockBusyError } =
      await import('./sync-lock')

    let caught: unknown
    try {
      await withSyncLock(SYNC_LOCK_KEYS.avec, async () => 'nope', { owner: 'test-2' })
    } catch (e) {
      caught = e
    }

    expect(caught).toBeInstanceOf(SyncLockBusyError)
    expect(isSyncLockBusyError(caught)).toBe(true)
    if (isSyncLockBusyError(caught)) {
      expect(caught.holder).toBe('other')
      expect(caught.key).toBe('avec_sync')
    }
  })

  it('libera lock mesmo se fn falhar', async () => {
    sqlMock
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ key: 'stock_sync' }])
      .mockResolvedValueOnce(undefined)

    const { withSyncLock, SYNC_LOCK_KEYS } = await import('./sync-lock')

    await expect(
      withSyncLock(
        SYNC_LOCK_KEYS.stock,
        async () => {
          throw new Error('boom')
        },
        { owner: 'test-fail' },
      ),
    ).rejects.toThrow('boom')

    // create + index + acquire + release
    expect(sqlMock.mock.calls.length).toBeGreaterThanOrEqual(4)
  })
})
