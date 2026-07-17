import { describe, expect, it, vi, beforeEach } from 'vitest'

const sqlMock = vi.fn()

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

describe('finance', () => {
  beforeEach(() => {
    sqlMock.mockReset()
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
        'Descrição é obrigatória'
      )
      expect(sqlMock).not.toHaveBeenCalled()
    })

    it('rejeita valor zero ou negativo', async () => {
      const { createExpense } = await import('@/lib/finance')
      await expect(createExpense({ ...baseInput, amount: 0 })).rejects.toThrow(
        'Valor precisa ser maior que zero'
      )
      await expect(createExpense({ ...baseInput, amount: -10 })).rejects.toThrow(
        'Valor precisa ser maior que zero'
      )
      expect(sqlMock).not.toHaveBeenCalled()
    })

    it('insere despesa válida', async () => {
      const created = { id: 'e1', category_id: 'c1', description: 'Compra de produtos', amount: 150, expense_date: '2026-07-01', notes: null, receipt_url: null, created_at: 'now' }
      sqlMock.mockResolvedValueOnce([created])

      const { createExpense } = await import('@/lib/finance')
      const result = await createExpense(baseInput)

      expect(result).toEqual(created)
    })
  })

  describe('computeFinanceKpis', () => {
    it('calcula margem bruta e fluxo de caixa do mês corrente e anterior', async () => {
      // current bucket: revenue, expenses, payment_mix; previous bucket: idem
      sqlMock
        .mockResolvedValueOnce([{ revenue: '10000' }]) // current revenue
        .mockResolvedValueOnce([{ total: '4000' }]) // current expenses
        .mockResolvedValueOnce([]) // current payment_mix
        .mockResolvedValueOnce([{ revenue: '8000' }]) // previous revenue
        .mockResolvedValueOnce([{ total: '2000' }]) // previous expenses
        .mockResolvedValueOnce([]) // previous payment_mix

      const { computeFinanceKpis } = await import('@/lib/finance')
      const result = await computeFinanceKpis({ month: '2026-07' })

      expect(result.current.month).toBe('2026-07')
      expect(result.current.revenue).toBe(10000)
      expect(result.current.expenses).toBe(4000)
      expect(result.current.gross_margin).toBe(60)
      expect(result.current.cash_flow).toBe(6000)

      expect(result.previous.month).toBe('2026-06')
      expect(result.previous.gross_margin).toBe(75)
    })

    it('retorna margem null quando não há receita sincronizada da Avec ainda', async () => {
      sqlMock
        .mockResolvedValueOnce([{ revenue: '0' }])
        .mockResolvedValueOnce([{ total: '500' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ revenue: '0' }])
        .mockResolvedValueOnce([{ total: '0' }])
        .mockResolvedValueOnce([])

      const { computeFinanceKpis } = await import('@/lib/finance')
      const result = await computeFinanceKpis({ month: '2026-07' })

      expect(result.current.gross_margin).toBeNull()
      expect(result.current.cash_flow).toBe(-500)
    })

    it('vira o ano corretamente ao calcular o mês anterior a janeiro', async () => {
      sqlMock
        .mockResolvedValueOnce([{ revenue: '1000' }])
        .mockResolvedValueOnce([{ total: '100' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ revenue: '900' }])
        .mockResolvedValueOnce([{ total: '90' }])
        .mockResolvedValueOnce([])

      const { computeFinanceKpis } = await import('@/lib/finance')
      const result = await computeFinanceKpis({ month: '2026-01' })

      expect(result.previous.month).toBe('2025-12')
    })

    it('agrega payment_mix por método somando os dias do período', async () => {
      sqlMock
        .mockResolvedValueOnce([{ revenue: '1000' }])
        .mockResolvedValueOnce([{ total: '0' }])
        .mockResolvedValueOnce([
          { payment_mix: [{ method: 'Pix', amount: 300, share: 0 }, { method: 'Cartão', amount: 100, share: 0 }] },
          { payment_mix: [{ method: 'Pix', amount: 200, share: 0 }] },
        ])
        .mockResolvedValueOnce([{ revenue: '0' }])
        .mockResolvedValueOnce([{ total: '0' }])
        .mockResolvedValueOnce([])

      const { computeFinanceKpis } = await import('@/lib/finance')
      const result = await computeFinanceKpis({ month: '2026-07' })

      expect(result.current.payment_mix).toEqual([
        { method: 'Pix', amount: 500, share: 83.3 },
        { method: 'Cartão', amount: 100, share: 16.7 },
      ])
    })
  })
})
