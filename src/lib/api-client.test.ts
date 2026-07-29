import { describe, expect, it, beforeEach, vi } from 'vitest'
import { apiFetch, clearApiClientCache } from '@/lib/api-client'

describe('apiFetch client cache', () => {
  beforeEach(() => {
    clearApiClientCache()
    vi.restoreAllMocks()
  })

  it('reusa GET em memória na 2ª chamada', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: 1 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const a = await apiFetch('/api/pipeline', { cache: 'no-store' })
    const b = await apiFetch('/api/pipeline', { cache: 'no-store' })
    expect(await a.json()).toEqual({ data: 1 })
    expect(await b.json()).toEqual({ data: 1 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('clientCache:false força rede', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: 1 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await apiFetch('/api/hoje', { cache: 'no-store' })
    await apiFetch('/api/hoje', { cache: 'no-store', clientCache: false })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
