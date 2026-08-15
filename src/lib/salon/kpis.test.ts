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

  it('conversion_rate fica null quando o mês não tem entrada no funil', async () => {
    sqlMock.mockImplementation((strings: TemplateStringsArray) => {
      const text = Array.isArray(strings) ? strings.join('?') : String(strings ?? '')
      if (text.includes('funnel_contacts')) {
        return Promise.resolve([
          {
            conversion_rate: null,
            total_contacts: 12,
            funnel_contacts: 0,
            imported_contacts: 12,
          },
        ])
      }
      return Promise.resolve([])
    })

    const { fetchContactKpis } = await import('@/lib/salon/kpis')
    const result = await fetchContactKpis(30, '2026-08-03')

    expect(result.conversion).toEqual({
      conversion_rate: null,
      total_contacts: 12,
      funnel_contacts: 0,
      imported_contacts: 12,
    })

    const conversion = sqlMock.mock.calls.find((call) =>
      queryTextOf(call as unknown[]).includes('funnel_contacts'),
    )
    expect(queryTextOf(conversion as unknown[])).not.toMatch(/coalesce\(\s*count\(\*\) filter/)
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
