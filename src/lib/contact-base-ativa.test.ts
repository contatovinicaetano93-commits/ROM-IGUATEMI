import { describe, expect, it, vi, beforeEach } from 'vitest'

const sqlMock = vi.fn()

vi.mock('@/lib/db', () => ({
  getSql: () => sqlMock,
}))

describe('countBaseAtiva', () => {
  beforeEach(() => {
    sqlMock.mockReset()
  })

  it('conta entrada no mês (first_contact) fora de dumps Avec', async () => {
    sqlMock.mockResolvedValueOnce([{ n: 12 }])
    const { countBaseAtiva } = await import('@/lib/contact-summary')
    await expect(countBaseAtiva()).resolves.toBe(12)

    const texto = (sqlMock.mock.calls[0]![0] as string[]).join(' ')
    expect(texto).toContain('anonymized_at is null')
    expect(texto).toContain("status <> 'importado'")
    expect(texto).toContain('first_contact_at')
    expect(texto).toMatch(/avec_sync_clients/)
    expect(texto).toMatch(/avec_backfill/)
    expect(texto).toMatch(/avec_lake/)
  })

  it('trata ausência como zero', async () => {
    sqlMock.mockResolvedValueOnce([])
    const { countBaseAtiva } = await import('@/lib/contact-summary')
    await expect(countBaseAtiva()).resolves.toBe(0)
  })
})
