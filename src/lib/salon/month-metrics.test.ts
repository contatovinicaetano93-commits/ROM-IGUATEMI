import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  computeMonthCompleteness,
  listDaysInclusive,
  statusLabelPt,
} from '@/lib/salon/month-metrics'

const sqlMock = vi.fn()

vi.mock('@/lib/db', () => ({
  getSql: () => sqlMock,
}))

function sqlText(call: unknown[] | undefined): string {
  const strings = call?.[0] as TemplateStringsArray | undefined
  return strings ? Array.from(strings).join(' ') : ''
}

describe('listDaysInclusive', () => {
  it('lista dias do intervalo', () => {
    expect(listDaysInclusive('2026-07-01', '2026-07-03')).toEqual([
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
    ])
  })
})

describe('computeMonthCompleteness', () => {
  it('marca mês passado completo sem buracos', () => {
    const days = listDaysInclusive('2026-06-01', '2026-06-30')
    const c = computeMonthCompleteness('2026-06', days, '2026-07-15')
    expect(c.status).toBe('complete')
    expect(c.days_missing).toEqual([])
    expect(c.days_expected).toBe(30)
  })

  it('marca INCOMPLETO quando falta dia em mês fechado', () => {
    const days = listDaysInclusive('2026-06-01', '2026-06-30').filter((d) => d !== '2026-06-15')
    const c = computeMonthCompleteness('2026-06', days, '2026-07-15')
    expect(c.status).toBe('incomplete')
    expect(c.days_missing).toEqual(['2026-06-15'])
    expect(statusLabelPt(c.status)).toBe('INCOMPLETO')
  })

  it('mês atual sem buracos fica em andamento', () => {
    const days = listDaysInclusive('2026-07-01', '2026-07-22')
    const c = computeMonthCompleteness('2026-07', days, '2026-07-23')
    expect(c.status).toBe('in_progress')
    expect(c.check_through).toBe('2026-07-22')
    expect(c.days_missing).toEqual([])
  })

  it('mês atual com buraco fica incompleto', () => {
    const days = listDaysInclusive('2026-07-01', '2026-07-22').filter((d) => d !== '2026-07-10')
    const c = computeMonthCompleteness('2026-07', days, '2026-07-23')
    expect(c.status).toBe('incomplete')
    expect(c.days_missing).toContain('2026-07-10')
  })
})

describe('readSalonWindowTotals', () => {
  beforeEach(() => {
    sqlMock.mockReset()
  })

  it('devolve null quando nenhum dia tem receita conhecida', async () => {
    sqlMock.mockResolvedValueOnce([
      {
        revenue: null,
        revenue_days: 0,
        attended: 0,
        cancelled: 0,
        no_shows: 0,
        appointments: 0,
        new_clients: 0,
        returning_clients: 0,
      },
    ])
    const { readSalonWindowTotals } = await import('@/lib/salon/month-metrics')
    await expect(readSalonWindowTotals('2026-08-01', '2026-08-13')).resolves.toBeNull()
    expect(sqlMock).toHaveBeenCalledTimes(1)
  })

  it('exclui TED/lucros/mútuos Omie na soma de despesas', async () => {
    sqlMock.mockImplementation(async (strings: TemplateStringsArray) => {
      const text = Array.from(strings).join(' ')
      if (text.includes('salon_daily_metrics')) {
        return [
          {
            revenue: 1000,
            revenue_days: 1,
            attended: 4,
            cancelled: 0,
            no_shows: 0,
            appointments: 4,
            new_clients: 1,
            returning_clients: 3,
          },
        ]
      }
      if (text.includes('finance_expenses')) return [{ total: 200 }]
      if (text.includes('stock_movements')) return [{ cmv: 50 }]
      return []
    })
    const { readSalonWindowTotals } = await import('@/lib/salon/month-metrics')
    const totals = await readSalonWindowTotals('2026-08-01', '2026-08-13')
    expect(totals?.revenue).toBe(1000)
    expect(totals?.expenses).toBe(200)
    expect(totals?.cmv).toBe(50)
    const expenseSql = sqlMock.mock.calls.map((c) => sqlText(c as unknown[])).find((t) =>
      t.includes('finance_expenses'),
    )
    expect(expenseSql).toContain('TED entre contas')
    expect(expenseSql).toContain('2.16%')
    expect(expenseSql).toContain("coalesce(source, 'manual') = 'omie'")
  })
})
