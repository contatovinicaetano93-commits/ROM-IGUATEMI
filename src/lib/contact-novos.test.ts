import { describe, expect, it, vi, beforeEach } from 'vitest'

const sqlMock = vi.fn()

vi.mock('@/lib/db', () => ({
  getSql: () => sqlMock,
}))

function queryTextOf(call: unknown[]): string {
  const strings = call[0] as TemplateStringsArray | undefined
  return Array.isArray(strings) ? strings.join('?') : String(strings ?? '')
}

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

  it('listNewContactsNotInAvec usa um SELECT com count(*) over e zera urgência', async () => {
    sqlMock.mockResolvedValueOnce([
      {
        id: 'c1',
        name: 'Ana',
        phone: '+5511999999999',
        email: null,
        channel: 'whatsapp',
        source: 'atendente',
        status: 'novo',
        avec_client_id: null,
        notes: null,
        preferred_manicurist: null,
        preferred_hairstylist: null,
        first_contact_at: '2026-08-01T10:00:00Z',
        last_contact_at: '2026-08-01T10:00:00Z',
        created_at: '2026-08-01T10:00:00Z',
        anonymized_at: null,
        total: 2,
      },
    ])
    const { listNewContactsNotInAvec } = await import('@/lib/contact-summary')
    const result = await listNewContactsNotInAvec({ day: '2026-08-01', limit: 50 })
    expect(sqlMock).toHaveBeenCalledTimes(1)
    const sqlText = queryTextOf(sqlMock.mock.calls[0] as unknown[])
    expect(sqlText).toMatch(/count\(\*\)\s+over\(\)/i)
    expect(sqlText).not.toMatch(/select\s+\*\s+from\s+contacts/i)
    expect(result.total).toBe(2)
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({
      id: 'c1',
      name: 'Ana',
      overdue: 0,
      max_overdue_days: 0,
      due_soon: 0,
      scheduled_soon: 0,
      pending_actions: 0,
      urgency_score: 0,
      top_action: null,
      next_scheduled_at: null,
    })
    expect(result.items[0]).not.toHaveProperty('total')
  })

  it('listNewContactsNotInAvec retorna total 0 sem rows', async () => {
    sqlMock.mockResolvedValueOnce([])
    const { listNewContactsNotInAvec } = await import('@/lib/contact-summary')
    await expect(listNewContactsNotInAvec({ day: '2026-08-01' })).resolves.toEqual({
      items: [],
      total: 0,
    })
  })
})
