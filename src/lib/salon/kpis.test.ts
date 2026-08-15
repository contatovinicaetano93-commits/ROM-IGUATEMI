import { describe, expect, it, vi, beforeEach } from 'vitest'

const sqlMock = vi.fn()

vi.mock('@/lib/db', () => ({
  getSql: () => sqlMock,
}))

function queryTextOf(call: unknown[]): string {
  const strings = call[0] as TemplateStringsArray | undefined
  return Array.isArray(strings) ? strings.join('?') : String(strings ?? '')
}

describe('fetchContactKpis', () => {
  beforeEach(() => {
    sqlMock.mockReset()
    sqlMock.mockResolvedValue([])
  })

  it('funnel_contacts e conversion_rate usam o mês, não a janela rolling', async () => {
    const { fetchContactKpis } = await import('@/lib/salon/kpis')
    await fetchContactKpis(30, '2026-08-03')

    const conversion = sqlMock.mock.calls.find((call) =>
      queryTextOf(call as unknown[]).includes('funnel_contacts'),
    )
    expect(conversion).toBeTruthy()
    const values = conversion!.slice(1)
    expect(values).toContain('2026-08-01')
    expect(values).toContain('2026-08-03')
    expect(values).not.toContain('2026-07-05')
  })

  it('byDay continua na janela rolling de dayLimit', async () => {
    const { fetchContactKpis } = await import('@/lib/salon/kpis')
    await fetchContactKpis(30, '2026-08-03')

    const byDay = sqlMock.mock.calls.find((call) =>
      queryTextOf(call as unknown[]).includes('contacts_count'),
    )
    expect(byDay).toBeTruthy()
    const values = byDay!.slice(1)
    expect(values).toContain('2026-07-05')
    expect(values).toContain('2026-08-03')
  })
})
