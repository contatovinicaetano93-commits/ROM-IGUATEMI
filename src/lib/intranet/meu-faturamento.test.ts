import { describe, expect, it } from 'vitest'
import { resolveMeuComissao, resolveMeuFaturamento } from '@/lib/intranet/meu-faturamento'
import type { CommissionProfessionalRow } from '@/lib/salon/commission-metrics'
import type { P1ProfessionalRow } from '@/lib/salon/p1-metrics'

const sample: P1ProfessionalRow[] = [
  { name: 'Ana Souza', revenue: 1200, attended: 10, ticket_avg: 120, occupancy: 0.4 },
  { name: 'Cida', revenue: 0, attended: 0, ticket_avg: 0, occupancy: null },
]

const commissions: CommissionProfessionalRow[] = [
  {
    name: 'JEFFERSON POLICARPO DOS SANTOS',
    role: 'MULTIPLICADOR',
    charged: 12000,
    service_share: 8000,
    product_share: null,
    other_share: null,
    tip: 50,
    product_spend: -114.12,
    card_fee: null,
    admin_fee: null,
    assistant_discount: -150,
    other_discounts: -707.19,
    net_payable: 6032.64,
    house_share: 4000,
  },
]

describe('resolveMeuFaturamento', () => {
  it('sem nome ou sem snapshot → null (não inventa 0)', () => {
    expect(resolveMeuFaturamento(sample, null).revenue).toBeNull()
    expect(resolveMeuFaturamento([], 'Ana').revenue).toBeNull()
  })

  it('casa por nome próximo e preserva R$ 0 real', () => {
    const ana = resolveMeuFaturamento(sample, 'Ana Souza - Colorista')
    expect(ana.matched_name).toBe('Ana Souza')
    expect(ana.revenue).toBe(1200)
    expect(ana.attended).toBe(10)

    const cida = resolveMeuFaturamento(sample, 'Cida')
    expect(cida.revenue).toBe(0)
    expect(cida.occupancy).toBeNull()
  })

  it('nome sem match → null', () => {
    expect(resolveMeuFaturamento(sample, 'Fulano Inexistente').matched_name).toBeNull()
    expect(resolveMeuFaturamento(sample, 'Fulano Inexistente').revenue).toBeNull()
  })
})

describe('resolveMeuComissao', () => {
  it('sem snapshot ou sem match → null (não inventa 0)', () => {
    expect(resolveMeuComissao([], 'Jefferson').net_payable).toBeNull()
    expect(resolveMeuComissao(commissions, null).net_payable).toBeNull()
    expect(resolveMeuComissao(commissions, 'Fulano').net_payable).toBeNull()
    expect(resolveMeuComissao(commissions, 'Fulano').assistant_discount).toBeNull()
  })

  it('espelha a_pagar e abatimentos do 8123', () => {
    const row = resolveMeuComissao(commissions, 'Jefferson Policarpo')
    expect(row.commission_matched_name).toBe('JEFFERSON POLICARPO DOS SANTOS')
    expect(row.net_payable).toBe(6032.64)
    expect(row.assistant_discount).toBe(-150)
    expect(row.product_spend).toBe(-114.12)
    expect(row.other_discounts).toBe(-707.19)
    expect(row.card_fee).toBeNull()
    expect(row.tip).toBe(50)
    expect(row.house_share).toBe(4000)
  })
})
