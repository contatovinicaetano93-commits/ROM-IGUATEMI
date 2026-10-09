import { beforeEach, describe, expect, it, vi } from 'vitest'

const sqlMock = vi.fn()

vi.mock('@/lib/db', () => ({
  getSql: () => sqlMock,
}))

vi.mock('@/lib/brand', () => ({
  getRomPanelId: () => 'iguatemi',
}))

function pgError(code: string, message: string): Error {
  const error = new Error(message)
  ;(error as Error & { code: string }).code = code
  return error
}

function sqlText(call: unknown[]): string {
  const strings = call[0]
  if (Array.isArray(strings)) return strings.join(' ')
  return String(strings ?? '')
}

const v1Row = {
  id: '1',
  day: '2026-09-01',
  start_time: '10:00:00',
  end_time: '10:00:00',
  brand: 'Marca',
  condition: 'comercial',
  notes: null,
  status: 'confirmed',
  created_by_employee_id: null,
  created_by_name: 'Ana',
  created_by_role: 'mkt',
  cancelled_by_name: null,
  cancelled_at: null,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
}

describe('listBrandActivationsForMonth', () => {
  beforeEach(() => {
    sqlMock.mockReset()
    vi.resetModules()
  })

  it('lê schema v1 sem end_time em vez de falhar o GET', async () => {
    sqlMock
      .mockRejectedValueOnce(pgError('42703', 'column "end_time" does not exist'))
      .mockResolvedValueOnce([v1Row])

    const { listBrandActivationsForMonth } = await import('./store')
    const rows = await listBrandActivationsForMonth('2026-09')

    expect(rows).toHaveLength(1)
    expect(rows[0]?.end_time).toBe('10:00')
    expect(rows[0]?.start_time).toBe('10:00')
    expect(rows[0]?.writable).toBe(true)
    expect(sqlMock).toHaveBeenCalledTimes(2)
    expect(sqlText(sqlMock.mock.calls[0])).toMatch(/end_time::text as end_time/)
    expect(sqlText(sqlMock.mock.calls[1])).toMatch(/start_time::text as end_time/)
  })

  it('relança erro que não é coluna end_time ausente', async () => {
    sqlMock.mockRejectedValueOnce(pgError('57014', 'canceling statement due to statement timeout'))

    const { listBrandActivationsForMonth } = await import('./store')

    await expect(listBrandActivationsForMonth('2026-09')).rejects.toThrow(/statement timeout/)
    expect(sqlMock).toHaveBeenCalledTimes(1)
  })
})
