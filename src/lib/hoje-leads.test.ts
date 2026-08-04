import { describe, expect, it, vi, beforeEach } from 'vitest'

const sqlMock = vi.fn()

vi.mock('@/lib/db', () => ({
  getSql: () => sqlMock,
}))

function queryTextOf(call: unknown[]): string {
  const strings = call[0] as TemplateStringsArray | undefined
  return Array.isArray(strings) ? strings.join('?') : String(strings ?? '')
}

describe('countNovosHoje', () => {
  beforeEach(() => {
    sqlMock.mockReset()
  })

  it('conta novos do dia com filtro Contatos Novos (main)', async () => {
    sqlMock.mockResolvedValueOnce([{ n: 4 }])
    const { countNovosHoje } = await import('@/lib/hoje-leads')
    const { DUE_SOON_DAYS } = await import('@/lib/salon/constants')
    await expect(countNovosHoje('2026-08-01')).resolves.toBe(4)
    const sqlText = queryTextOf(sqlMock.mock.calls[0] as unknown[])
    expect(sqlText).toMatch(/channel\s*=\s*'avec'/i)
    expect(sqlText).toMatch(/avec_client_id\s+is\s+null/i)
    expect(sqlText).toMatch(/status\s*=\s*'novo'/i)
    expect(sqlText).toMatch(/avec_sync_clients%/i)
    expect(sqlText).toMatch(/avec_backfill%/i)
    expect(sqlText).toMatch(/avec_lake%/i)
    // Paridade com Novos: exclui quem já conta em Vencendo/Atrasados.
    expect(sqlText).toMatch(/not exists/i)
    expect(sqlText).toMatch(/client_services/i)
    expect(sqlText).toMatch(/last_done_at is not null/i)
    expect(sqlText).toMatch(/cadence_days is not null/i)
    const values = sqlMock.mock.calls[0]!.slice(1)
    expect(values).toContain(DUE_SOON_DAYS)
  })
})

describe('countWhatsappNovosToday', () => {
  beforeEach(() => {
    sqlMock.mockReset()
  })

  it('conta whatsapp novos do dia com exclusões de dump Avec', async () => {
    sqlMock.mockResolvedValueOnce([{ n: 2 }])
    const { countWhatsappNovosToday } = await import('@/lib/hoje-leads')
    await expect(countWhatsappNovosToday('2026-08-01')).resolves.toBe(2)
    const sqlText = queryTextOf(sqlMock.mock.calls[0] as unknown[])
    expect(sqlText).toMatch(/channel\s*=\s*'whatsapp'/i)
    expect(sqlText).toMatch(/status\s*=\s*'novo'/i)
    expect(sqlText).toMatch(/avec_client_id\s+is\s+null/i)
    expect(sqlText).toMatch(/avec_sync_clients%/i)
    expect(sqlText).toMatch(/avec_backfill%/i)
    expect(sqlText).toMatch(/avec_lake%/i)
  })

  it('trata ausência como zero', async () => {
    sqlMock.mockResolvedValueOnce([])
    const { countWhatsappNovosToday } = await import('@/lib/hoje-leads')
    await expect(countWhatsappNovosToday('2026-08-01')).resolves.toBe(0)
  })
})
