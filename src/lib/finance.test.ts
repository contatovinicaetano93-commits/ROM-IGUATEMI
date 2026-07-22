import { describe, expect, it, vi, beforeEach } from 'vitest'

const sqlMock = vi.fn()
const getPaymentMixRange = vi.fn()

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
}))

function mockBucketSql(opts: {
  revenue: string
  expenses: string
  attended?: number
  daily?: unknown[]
  cmv?: number
}) {
  sqlMock
    .mockResolvedValueOnce([{ revenue: opts.revenue }])
    .mockResolvedValueOnce([{ total: opts.expenses }])
    .mockResolvedValueOnce([{ attended: opts.attended ?? 0 }])
    .mockResolvedValueOnce(opts.daily ?? [])
    .mockResolvedValueOnce([{ cmv: opts.cmv ?? 0 }])
}

describe('finance', () => {
  beforeEach(() => {
    sqlMock.mockReset()
    getPaymentMixRange.mockReset().mockResolvedValue([])
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
    it('calcula margem, fluxo e CMV (sem métricas comerciais)', async () => {
      mockBucketSql({
        revenue: '10000',
        expenses: '4000',
        attended: 50,
        cmv: 500,
      })
      mockBucketSql({ revenue: '8000', expenses: '2000', attended: 40 })

      const { computeFinanceKpis } = await import('@/lib/finance')
      const result = await computeFinanceKpis({ month: '2026-07' })

      expect(result.current.month).toBe('2026-07')
      expect(result.current.revenue).toBe(10000)
      expect(result.current.expenses).toBe(4000)
      expect(result.current.gross_margin).toBe(60)
      expect(result.current.cash_flow).toBe(6000)
      expect(result.current.ticket_avg).toBe(200)
      expect(result.current.cmv).toBe(500)
      expect(result.current.margin_after_cmv).toBe(55)
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
