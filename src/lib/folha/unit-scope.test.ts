import { describe, expect, it } from 'vitest'
import {
  filterFolhaProfessionalsForPanel,
  folhaNameBelongsToPanel,
  folhaPeriodNeedsUnitScope,
} from '@/lib/folha/unit-scope'
import { isFolhaStatusOpenForUnitScope } from '@/lib/folha/workflow'
import type { CommissionProfessionalRow } from '@/lib/salon/commission-metrics'

function row(name: string): CommissionProfessionalRow {
  return {
    name,
    role: null,
    charged: 100,
    service_share: null,
    product_share: null,
    other_share: null,
    tip: null,
    product_spend: null,
    card_fee: null,
    admin_fee: null,
    assistant_discount: null,
    other_discounts: null,
    net_payable: 50,
    house_share: null,
  }
}

describe('folhaNameBelongsToPanel', () => {
  it('mantém exclusivo da casa e dual-unidade', () => {
    expect(folhaNameBelongsToPanel('brasil', 'Alison Alvarez')).toBe(true)
    expect(folhaNameBelongsToPanel('brasil', 'Alan Fernando De Albuquerque')).toBe(true)
    expect(folhaNameBelongsToPanel('iguatemi', 'Beto Fortes')).toBe(true)
    expect(folhaNameBelongsToPanel('iguatemi', 'JEFFERSON POLICARPO DOS SANTOS')).toBe(true)
  })

  it('remove exclusivo da outra unidade', () => {
    expect(folhaNameBelongsToPanel('iguatemi', 'Alison Alvarez')).toBe(false)
    expect(folhaNameBelongsToPanel('brasil', 'Beto Fortes')).toBe(false)
  })

  it('mantém nome que não está em nenhum roster', () => {
    expect(folhaNameBelongsToPanel('brasil', 'Contratacao Nova 2026')).toBe(true)
    expect(folhaNameBelongsToPanel('iguatemi', 'Contratacao Nova 2026')).toBe(true)
  })
})

describe('filterFolhaProfessionalsForPanel', () => {
  it('isola o 8123 misturado na unidade do painel', () => {
    const mixed = [
      row('Alison Alvarez'),
      row('Beto Fortes'),
      row('Alan Fernando De Albuquerque'),
      row('Contratacao Nova 2026'),
    ]
    expect(filterFolhaProfessionalsForPanel('brasil', mixed).map((p) => p.name)).toEqual([
      'Alison Alvarez',
      'Alan Fernando De Albuquerque',
      'Contratacao Nova 2026',
    ])
    expect(filterFolhaProfessionalsForPanel('iguatemi', mixed).map((p) => p.name)).toEqual([
      'Beto Fortes',
      'Alan Fernando De Albuquerque',
      'Contratacao Nova 2026',
    ])
  })
})

describe('isFolhaStatusOpenForUnitScope', () => {
  it('abre rascunho e fecha aprovado/pago', () => {
    expect(isFolhaStatusOpenForUnitScope('draft')).toBe(true)
    expect(isFolhaStatusOpenForUnitScope('ready_for_review')).toBe(true)
    expect(isFolhaStatusOpenForUnitScope('awaiting_rules')).toBe(true)
    expect(isFolhaStatusOpenForUnitScope('approved')).toBe(false)
    expect(isFolhaStatusOpenForUnitScope('paid')).toBe(false)
  })
})

describe('folhaPeriodNeedsUnitScope', () => {
  it('detecta linha exclusiva da outra unidade', () => {
    expect(
      folhaPeriodNeedsUnitScope('iguatemi', {
        lines: [{ name: 'Alison Alvarez' }, { name: 'Beto Fortes' }],
        source_professionals: [],
      }),
    ).toBe(true)
    expect(
      folhaPeriodNeedsUnitScope('iguatemi', {
        lines: [{ name: 'Beto Fortes' }],
        source_professionals: [row('Beto Fortes')],
      }),
    ).toBe(false)
  })
})
