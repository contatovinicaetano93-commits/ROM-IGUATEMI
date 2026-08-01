import { describe, expect, it, vi, beforeEach } from 'vitest'

const sqlMock = vi.fn()

vi.mock('@/lib/db', () => ({
  getSql: () => sqlMock,
}))

describe('new contacts not in Avec', () => {
  beforeEach(() => {
    sqlMock.mockReset()
  })

  it('countNewContactsNotInAvec lê o count do dia', async () => {
    sqlMock.mockResolvedValueOnce([{ n: 3 }])
    const { countNewContactsNotInAvec } = await import('@/lib/contact-summary')
    await expect(countNewContactsNotInAvec({ day: '2026-08-01' })).resolves.toBe(3)
    expect(sqlMock).toHaveBeenCalledTimes(1)
  })

  it('countNewContactsNotInAvec trata ausência como zero', async () => {
    sqlMock.mockResolvedValueOnce([])
    const { countNewContactsNotInAvec } = await import('@/lib/contact-summary')
    await expect(countNewContactsNotInAvec({ day: '2026-08-01' })).resolves.toBe(0)
  })
})
