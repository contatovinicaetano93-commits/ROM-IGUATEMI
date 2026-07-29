import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('scheduleAvecWebhookSideEffects', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.stubEnv('AVEC_API_TOKEN', 'test-token')
    vi.stubEnv('CRON_SECRET', 'cron-secret')
    vi.stubEnv('VERCEL_URL', 'rom-club.vercel.app')
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('ok'))
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('dispara fast em appointment.created', async () => {
    const { runAvecWebhookSideEffects } = await import('@/lib/avec/sync-trigger')
    await runAvecWebhookSideEffects('appointment.created')

    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    expect(String((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0])).toContain(
      'mode=fast',
    )
  })

  it('dispara só fast em service.completed (full fica no cron)', async () => {
    const { runAvecWebhookSideEffects } = await import('@/lib/avec/sync-trigger')
    await runAvecWebhookSideEffects('service.completed')

    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] ?? []
    expect(String(url)).toContain('mode=fast')
    expect((init as RequestInit)?.headers).toMatchObject({
      'x-rom-sync-reason': 'webhook',
    })
  })

  it('não dispara sync em client.upsert', async () => {
    const { runAvecWebhookSideEffects } = await import('@/lib/avec/sync-trigger')
    await runAvecWebhookSideEffects('client.upsert')

    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})
