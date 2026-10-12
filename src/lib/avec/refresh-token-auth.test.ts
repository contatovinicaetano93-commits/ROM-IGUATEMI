import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const isCronAuthorized = vi.hoisted(() => vi.fn())
const requireAdmin = vi.hoisted(() => vi.fn())

vi.mock('@/lib/cron-auth', () => ({
  isCronAuthorized,
}))

vi.mock('@/lib/auth', () => ({
  requireAdmin,
}))

import { authorizeAvecRefreshToken } from './refresh-token-auth'

function req(): NextRequest {
  return { headers: new Headers() } as NextRequest
}

describe('authorizeAvecRefreshToken', () => {
  beforeEach(() => {
    isCronAuthorized.mockReset()
    requireAdmin.mockReset()
  })

  it('aceita cron autorizado sem exigir admin', async () => {
    isCronAuthorized.mockReturnValue(true)
    await expect(authorizeAvecRefreshToken(req())).resolves.toEqual({ cron: true })
    expect(requireAdmin).not.toHaveBeenCalled()
  })

  it('aceita admin quando não é cron', async () => {
    isCronAuthorized.mockReturnValue(false)
    requireAdmin.mockResolvedValue({ ok: true, session: { role: 'admin' } })
    await expect(authorizeAvecRefreshToken(req())).resolves.toEqual({ cron: false })
    expect(requireAdmin).toHaveBeenCalledTimes(1)
  })

  it('rejeita sessão não-admin (staff/financeiro)', async () => {
    isCronAuthorized.mockReturnValue(false)
    requireAdmin.mockResolvedValue({
      ok: false,
      status: 403,
      message: 'Acesso restrito ao admin operacional',
    })
    await expect(authorizeAvecRefreshToken(req())).resolves.toBeNull()
  })
})
