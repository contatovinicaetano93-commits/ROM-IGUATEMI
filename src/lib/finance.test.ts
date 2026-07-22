import { describe, expect, it, vi, beforeEach } from 'vitest'

const sqlMock = vi.fn()
const getPaymentMixRange = vi.fn()
const getSalonP1DailyNear = vi.fn()
const getSalonP2DailyNear = vi.fn()
const getSalonP3DailyNear = vi.fn()

vi.mock('@/lib/db', () => ({
  getSql: () => sqlMock,
}))

vi.mock('@/lib/fiscal-split', () => ({
  ensureFiscalSplitTable: vi.fn().mockResolvedValue(undefined),
  getFiscalSplitSummary: vi.fn().mockResolvedValue({
    gross_paid: 0,
    cbs_retained: 0,
    ibs_retained: 0,
    net_received: 0,
    pending_count: 0,
    settled_count: 0,
    configured: false,
  }),
}))

vi.mock('@/lib/salon/p2-metrics', () => ({
  getPaymentMixRange: (...args: unknown[]) => getPaymentMixRange(...args),
  getSalonP2DailyNear: (...args: unknown[]) => getSalonP2DailyNear(...args),
}))

vi.mock('@/lib/salon/p1-metrics', () => ({
  getSalonP1DailyNear: (...args: unknown[]) => getSalonP1DailyNear(...args),
}))

vi.mock('@/lib/salon/p3-metrics', () => ({
  getSalonP3DailyNear: (...args: unknown[]) => getSalonP3DailyNear(...args),
}))

function mockBucketSql(opts: {
  revenue: string
  expenses: string
  attended?: number
  daily?: unknown[]
  cancelled?: number
  no_shows?: number
  cmv?: number
}) {
  sqlMock
    .mockResolvedValueOnce([{ revenue: opts.revenue }])
    .mockResolvedValueOnce([{ total: opts.expenses }])
    .mockResolvedValueOnce([{ attended: opts.attended ?? 0 }])
    .mockResolvedValueOnce(opts.daily ?? [])
    .mockResolvedValueOnce([
      { cancelled: opts.cancelled ?? 0, no_shows: opts.no_shows ?? 0 },
    ])
    .mockResolvedValueOnce([{ cmv: opts.cmv ?? 0 }])
}

describe('finance', () => {
  beforeEach(() => {
    sqlMock.mockReset()
    getPaymentMixRange.mockReset().mockResolvedValue([])
    getSalonP1DailyNear.mockReset().mockResolvedValue(null)
    getSalonP2DailyNear.mockReset().mockResolvedValue(null)
    getSalonP3DailyNear.mockReset().mockResolvedValue(null)
  })

  describe('averageOccupancy / estimateLostRevenue', () => {
    it('pondera ocupação por atendidos', async () => {
      const { averageOccupancy } = await import('@/lib/finance')
      expect(
        averageOccupancy([
          { name: 'A', revenue: 100, attended: 10, ticket_avg: 10, occupancy: 0.8 },
          { name: 'B', revenue: 50, attended: 0, ticket_avg: 0, occupancy: 0.2 },
        ]),
      ).toBe(0.8)
    })

    it('estima receita perdida com ticket médio', async () => {
      const { estimateLostRevenue } = await import('@/lib/finance')
      expect(estimateLostRevenue(2, 3, 100)).toBe(500)
      expect(estimateLostRevenue(2, 3, null)).toBe(0)
    })
  })

  describe('createCategory', () => {
    it('rejeita nome vazio', async () => {
      const { createCategory } = await import('@/lib/finance')
      await expect(createCategory('   ')).rejects.toThrow('Nome da categoria é obrigatório')
      expect(sqlMock).not.toHaveBeenCalled()
    })

    it('reaproveita categoria existente em vez de duplicar', async () => {
      const existing = { id: 'c1', name: 'Aluguel', active: true, created_at: 'now' }
      sqlMock.mockResolvedValueOnce([existing])

      const { createCategory } = await import('@/lib/finance')
      const result = await createCategory('aluguel')

      expect(result).toBe(existing)
      expect(sqlMock).toHaveBeenCalledTimes(1)
    })
  })

  describe('createExpense', () => {
    const baseInput = {
      categoryId: 'c1',
      description: 'Compra de produtos',
      amount: 150,
      expenseDate: '2026-07-01',
    }

    it('rejeita descrição vazia', async () => {
      const { createExpense } = await import('@/lib/finance')
      await expect(createExpense({ ...baseInput, description: '   ' })).rejects.toThrow(
        'Descrição é obrigatória',
      )
      expect(sqlMock).not.toHaveBeenCalled()
    })

    it('rejeita valor zero ou negativo', async () => {
      const { createExpense } = await import('@/lib/finance')
      await expect(createExpense({ ...baseInput, amount: 0 })).rejects.toThrow(
        'Valor precisa ser maior que zero',
      )
      await expect(createExpense({ ...baseInput, amount: -10 })).rejects.toThrow(
        'Valor precisa ser maior que zero',
      )
      expect(sqlMock).not.toHaveBeenCalled()
    })

    it('insere despesa válida', async () => {
      const created = {
        id: 'e1',
        category_id: 'c1',
        description: 'Compra de produtos',
        amount: 150,
        expense_date: '2026-07-01',
        notes: null,
        receipt_url: null,
        created_at: 'now',
      }
      sqlMock.mockResolvedValueOnce([created])

      const { createExpense } = await import('@/lib/finance')
      const result = await createExpense(baseInput)

      expect(result).toEqual(created)
    })
  })

  describe('computeFinanceKpis', () => {
    it('calcula margem bruta, fluxo, CMV e receita perdida', async () => {
      mockBucketSql({
        revenue: '10000',
        expenses: '4000',
        attended: 50,
        cancelled: 2,
        no_shows: 3,
        cmv: 500,
      })
      mockBucketSql({ revenue: '8000', expenses: '2000', attended: 40 })

      getSalonP1DailyNear.mockResolvedValue({
        day: '2026-07-31',
        professionals: [
          { name: 'Ana', revenue: 1000, attended: 10, ticket_avg: 100, occupancy: 0.7 },
        ],
        services: [{ name: 'Corte', quantity: 5, revenue: 500 }],
        acquisition: [{ channel: 'Instagram', clients: 4 }],
        reactivation_count: 0,
        updated_at: 'now',
      })
      getSalonP2DailyNear.mockResolvedValue({
        day: '2026-07-31',
        booking_channels: [{ channel: 'WhatsApp', count: 12 }],
        packages: [{ name: 'Pacote 5x', quantity: 2, revenue: 800 }],
        packages_sold: 2,
        ratings_avg: 0,
        ratings_count: 0,
        payment_mix: [],
        birthday_count: 0,
        updated_at: 'now',
      })
      getSalonP3DailyNear.mockResolvedValue({
        day: '2026-07-31',
        return_rate: 0.42,
        new_clients_period: 18,
        revenue_curve: [],
        updated_at: 'now',
      })

      const { computeFinanceKpis } = await import('@/lib/finance')
      const result = await computeFinanceKpis({ month: '2026-07' })

      expect(result.current.month).toBe('2026-07')
      expect(result.current.revenue).toBe(10000)
      expect(result.current.expenses).toBe(4000)
      expect(result.current.gross_margin).toBe(60)
      expect(result.current.cash_flow).toBe(6000)
      expect(result.current.ticket_avg).toBe(200)
      expect(result.current.cancelled).toBe(2)
      expect(result.current.no_shows).toBe(3)
      expect(result.current.lost_revenue).toBe(1000)
      expect(result.current.cmv).toBe(500)
      expect(result.current.margin_after_cmv).toBe(55)
      expect(result.current.occupancy_avg).toBe(0.7)
      expect(result.current.packages_revenue).toBe(800)
      expect(result.current.booking_channels[0]?.channel).toBe('WhatsApp')
      expect(result.current.return_rate).toBe(0.42)
      expect(result.current.new_clients_period).toBe(18)

      expect(result.previous.month).toBe('2026-06')
      expect(result.previous.gross_margin).toBe(75)
    })

    it('retorna margem null quando não há receita sincronizada da Avec ainda', async () => {
      mockBucketSql({ revenue: '0', expenses: '500' })
      mockBucketSql({ revenue: '0', expenses: '0' })

      const { computeFinanceKpis } = await import('@/lib/finance')
      const result = await computeFinanceKpis({ month: '2026-07' })

      expect(result.current.gross_margin).toBeNull()
      expect(result.current.margin_after_cmv).toBeNull()
      expect(result.current.cash_flow).toBe(-500)
    })

    it('vira o ano corretamente ao calcular o mês anterior a janeiro', async () => {
      mockBucketSql({ revenue: '1000', expenses: '100' })
      mockBucketSql({ revenue: '900', expenses: '90' })

      const { computeFinanceKpis } = await import('@/lib/finance')
      const result = await computeFinanceKpis({ month: '2026-01' })

      expect(result.previous.month).toBe('2025-12')
    })

    it('usa payment_mix agregado do helper 0081', async () => {
      mockBucketSql({ revenue: '1000', expenses: '0' })
      mockBucketSql({ revenue: '0', expenses: '0' })
      getPaymentMixRange.mockResolvedValue([
        { method: 'Pix', amount: 500, share: 83.3 },
        { method: 'Cartão', amount: 100, share: 16.7 },
      ])

      const { computeFinanceKpis } = await import('@/lib/finance')
      const result = await computeFinanceKpis({ month: '2026-07' })

      expect(result.current.payment_mix).toEqual([
        { method: 'Pix', amount: 500, share: 83.3 },
        { method: 'Cartão', amount: 100, share: 16.7 },
      ])
    })
  })
})
