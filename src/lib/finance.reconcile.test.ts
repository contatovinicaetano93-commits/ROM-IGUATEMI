import { describe, expect, it } from 'vitest'
import { reconcileRevenueToPayments } from '@/lib/finance'

describe('reconcileRevenueToPayments', () => {
  it('marca aligned quando pagamentos ≈ receita', () => {
    const r = reconcileRevenueToPayments(1000, [
      { method: 'Pix', amount: 600, share: 60 },
      { method: 'Cartão', amount: 400, share: 40 },
    ])
    expect(r.status).toBe('aligned')
    expect(r.payments_total).toBe(1000)
    expect(r.delta).toBe(0)
  })

  it('marca missing_payments sem mix', () => {
    const r = reconcileRevenueToPayments(500, [])
    expect(r.status).toBe('missing_payments')
  })

  it('marca divergent fora da tolerância', () => {
    const r = reconcileRevenueToPayments(1000, [{ method: 'Pix', amount: 800, share: 100 }])
    expect(r.status).toBe('divergent')
    expect(r.delta).toBe(-200)
  })
})
