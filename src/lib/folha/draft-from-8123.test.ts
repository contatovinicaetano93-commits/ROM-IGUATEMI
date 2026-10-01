import { describe, expect, it } from 'vitest'
import {
  buildFolhaDraftFrom8123,
  buildFolhaDraftLine,
  deductionMagnitude,
  reconstructFatLiquidoFrom8123,
} from '@/lib/folha/draft-from-8123'
import { quinzenaForDay } from '@/lib/folha/period'
import type { CommissionProfessionalRow } from '@/lib/salon/commission-metrics'

const jefferson: CommissionProfessionalRow = {
  name: 'JEFFERSON POLICARPO DOS SANTOS',
  role: 'MULTIPLICADOR',
  charged: 12000,
  service_share: null,
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
}

const manicureComAdm: CommissionProfessionalRow = {
  name: 'Manicure Teste',
  role: 'Manicure',
  charged: 5000,
  service_share: null,
  product_share: null,
  other_share: null,
  tip: null,
  product_spend: -100,
  card_fee: null,
  admin_fee: -50,
  assistant_discount: null,
  other_discounts: null,
  net_payable: 2350,
  house_share: null,
}

describe('deductionMagnitude', () => {
  it('abs de negativo Avec; null permanece null', () => {
    expect(deductionMagnitude(-150)).toBe(150)
    expect(deductionMagnitude(null)).toBeNull()
  })
})

describe('quinzenaForDay', () => {
  it('1–15 = q1; 16+ = q2', () => {
    expect(quinzenaForDay('2026-05-10').id).toBe('2026-05-q1')
    expect(quinzenaForDay('2026-05-16').id).toBe('2026-05-q2')
    expect(quinzenaForDay('2026-05-31').to).toBe('2026-05-31')
  })
})

describe('buildFolhaDraftLine', () => {
  it('proposed_pay = a_pagar 8123 quando sem extras', () => {
    const line = buildFolhaDraftLine('brasil', jefferson)
    expect(line.proposed_pay).toBe(6032.64)
    expect(line.meio_a_meio).toBe(75)
    expect(line.flags).toContain('assistente_com_desconto')
    expect(line.folha_extras.darf).toBeNull()
  })

  it('abate DARF/DAS em cima do a_pagar sem recalcular comissão', () => {
    const line = buildFolhaDraftLine('brasil', jefferson, { darf: 100, das: 86.05 })
    expect(line.proposed_pay).toBe(6032.64 - 100 - 86.05)
  })

  it('Q2 (paga dia 05) ignora DARF/DAS/mensalidade no proposed_pay', () => {
    const line = buildFolhaDraftLine(
      'brasil',
      jefferson,
      { darf: 100, das: 86.05, mensalidade_contabilidade: 120 },
      { applyTaxExtras: false },
    )
    expect(line.folha_extras.darf).toBeNull()
    expect(line.folha_extras.das).toBeNull()
    expect(line.folha_extras.mensalidade_contabilidade).toBeNull()
    expect(line.proposed_pay).toBe(6032.64)
  })

  it('manicure com taxa adm no 8123 → flag (caderno: sem taxa adm)', () => {
    const line = buildFolhaDraftLine('brasil', manicureComAdm)
    expect(line.flags).toContain('manicure_com_taxa_adm')
    expect(line.cargo).toBe('manicure')
  })

  it('U informado deriva V 20% e W 3% BR', () => {
    const line = buildFolhaDraftLine('brasil', jefferson, {
      servicos_assistente_como_pro: 1000,
    })
    expect(line.folha_extras.valor_a_pagar_profissional).toBe(200)
    expect(line.folha_extras.taxa_servicos).toBe(30)
    expect(line.proposed_pay).toBe(6032.64 + 200 - 30)
  })

  it('U no IG usa taxa 4%', () => {
    const line = buildFolhaDraftLine('iguatemi', jefferson, {
      servicos_assistente_como_pro: 1000,
    })
    expect(line.folha_extras.taxa_servicos).toBe(40)
  })

  it('sem a_pagar → proposed_pay null (não inventa 0)', () => {
    const line = buildFolhaDraftLine('brasil', {
      ...jefferson,
      net_payable: null,
    })
    expect(line.proposed_pay).toBeNull()
    expect(line.flags).toContain('sem_a_pagar')
  })
})

describe('buildFolhaDraftFrom8123', () => {
  it('monta rascunho ordenado com total', () => {
    const draft = buildFolhaDraftFrom8123({
      panel: 'brasil',
      referenceDay: '2026-05-15',
      professionals: [jefferson, manicureComAdm],
    })
    expect(draft.source).toBe('8123')
    expect(draft.line_count).toBe(2)
    expect(draft.quinzena.half).toBe(1)
    expect(draft.total_proposed_pay).toBe(6032.64 + 2350)
    expect(draft.lines[0].name <= draft.lines[1].name).toBe(true)
  })
})

describe('reconstructFatLiquidoFrom8123', () => {
  it('soma a_pagar + magnitudes dos abatimentos', () => {
    const g = reconstructFatLiquidoFrom8123(jefferson)
    expect(g).toBe(6032.64 + 114.12 + 150 + 707.19)
  })
})
