import { describe, expect, it, vi, beforeEach } from 'vitest'

const sqlMock = vi.fn()
const anonymizeContactMock = vi.fn()

vi.mock('@/lib/db', () => ({
  getSql: () => sqlMock,
}))

vi.mock('@/lib/contacts', () => ({
  anonymizeContact: anonymizeContactMock,
}))

describe('purgeInactiveContacts', () => {
  beforeEach(() => {
    sqlMock.mockReset()
    anonymizeContactMock.mockReset()
  })

  it('anonimiza todos os contatos inativos encontrados', async () => {
    sqlMock.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }])
    anonymizeContactMock.mockResolvedValue({ id: 'a', anonymized_at: 'now' })

    const { purgeInactiveContacts } = await import('@/lib/lgpd')
    const result = await purgeInactiveContacts(1825)

    expect(anonymizeContactMock).toHaveBeenCalledTimes(2)
    expect(anonymizeContactMock).toHaveBeenCalledWith('a')
    expect(anonymizeContactMock).toHaveBeenCalledWith('b')
    expect(result.purged_ids).toEqual(['a', 'b'])
  })

  it('não conta contato como purgado se a anonimização retornar null (já anonimizado por outra chamada)', async () => {
    sqlMock.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }])
    anonymizeContactMock.mockResolvedValueOnce({ id: 'a', anonymized_at: 'now' }).mockResolvedValueOnce(null)

    const { purgeInactiveContacts } = await import('@/lib/lgpd')
    const result = await purgeInactiveContacts()

    expect(result.purged_ids).toEqual(['a'])
  })

  it('retorna lista vazia quando não há contato elegível', async () => {
    sqlMock.mockResolvedValueOnce([])

    const { purgeInactiveContacts } = await import('@/lib/lgpd')
    const result = await purgeInactiveContacts()

    expect(result.purged_ids).toEqual([])
    expect(anonymizeContactMock).not.toHaveBeenCalled()
  })

  it('usa DEFAULT_RETENTION_DAYS (5 anos) quando nenhum valor é passado', async () => {
    sqlMock.mockResolvedValueOnce([])

    const { purgeInactiveContacts, DEFAULT_RETENTION_DAYS } = await import('@/lib/lgpd')
    expect(DEFAULT_RETENTION_DAYS).toBe(5 * 365)

    const before = Date.now()
    const result = await purgeInactiveContacts()
    const expectedCutoff = new Date(before - DEFAULT_RETENTION_DAYS * 86400000).toISOString()

    // Tolerância de alguns segundos entre o cálculo do teste e o da função.
    expect(new Date(result.checked_cutoff).getTime()).toBeCloseTo(new Date(expectedCutoff).getTime(), -3)
  })
})
