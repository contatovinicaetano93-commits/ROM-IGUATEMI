import { describe, expect, it } from 'vitest'
import { mapSalonP3DailyRow } from '@/lib/salon/p3-metrics'

describe('mapSalonP3DailyRow', () => {
  it('não trata 0% legado sem flag como taxa real', () => {
    const row = mapSalonP3DailyRow({
      day: '2026-08-10',
      return_rate: 0,
      new_clients_period: 0,
      has_return_rate: false,
      has_new_clients: false,
      revenue_curve: [],
      updated_at: 'now',
    })
    expect(row.return_rate).toBeNull()
    expect(row.new_clients_period).toBeNull()
  })

  it('aceita 0% / 0 novos quando a flag marca sync real', () => {
    const row = mapSalonP3DailyRow({
      day: '2026-08-10',
      return_rate: 0,
      new_clients_period: 0,
      has_return_rate: true,
      has_new_clients: true,
      revenue_curve: [],
      updated_at: 'now',
    })
    expect(row.return_rate).toBe(0)
    expect(row.new_clients_period).toBe(0)
  })

  it('sem colunas de flag (schema legado): 0 vira null e valor >0 permanece', () => {
    const zero = mapSalonP3DailyRow({
      day: '2026-08-10',
      return_rate: 0,
      new_clients_period: 0,
      revenue_curve: [],
      updated_at: 'now',
    })
    expect(zero.return_rate).toBeNull()
    expect(zero.new_clients_period).toBeNull()

    const known = mapSalonP3DailyRow({
      day: '2026-08-10',
      return_rate: 0.42,
      new_clients_period: 18,
      revenue_curve: [],
      updated_at: 'now',
    })
    expect(known.return_rate).toBe(0.42)
    expect(known.new_clients_period).toBe(18)
  })
})
