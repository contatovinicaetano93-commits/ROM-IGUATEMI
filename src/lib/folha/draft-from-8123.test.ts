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
  it('proposed_pay = a_pagar 8123 + meio a meio quando sem extras fiscais', () => {
    const line = buildFolhaDraftLine('brasil', jefferson)
    // multiplicador: sem taxa adm sobre C; soma meio a meio
    expect(line.proposed_pay).toBe(6032.64 + 75)
    expect(line.meio_a_meio).toBe(75)
    expect(line.flags).toContain('assistente_com_desconto')
    expect(line.flags).toContain('assistente_romeu')
    expect(line.exception_id).toBe('romeu_assistant')
    expect(line.folha_extras.darf).toBeNull()
  })

  it('abate DARF/DAS em cima do a_pagar sem recalcular comissão', () => {
    const line = buildFolhaDraftLine('brasil', jefferson, { darf: 100, das: 86.05 })
    expect(line.proposed_pay).toBe(6032.64 + 75 - 100 - 86.05)
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
    expect(line.proposed_pay).toBe(6032.64 + 75)
  })

  it('IG cabeleireiro: taxa adm motor 7% sobre faturado quando 8123 veio 0', () => {
    const carina = {
      name: 'CARINA FERNANDA DE FREITAS FERREIRA',
      role: 'Cabeleireiro',
      charged: 21594,
      service_share: null,
      product_share: null,
      other_share: null,
      tip: null,
      product_spend: -1195.62,
      card_fee: -256.48,
      admin_fee: 0,
      assistant_discount: -1902.04,
      other_discounts: -560.56,
      net_payable: 6599.6981,
      house_share: null,
    }
    const line = buildFolhaDraftLine('iguatemi', carina, undefined, {
      applyTaxExtras: false,
    })
    expect(line.taxa_administrativa).toBe(1511.58)
    expect(line.taxa_administrativa_rate).toBe(0.07)
    expect(line.taxa_administrativa_source).toBe('motor')
    expect(line.flags).toContain('taxa_adm_motor')
    // 6599.6981 + 951.02 − 1511.58
    expect(line.proposed_pay).toBeCloseTo(6039.1381, 3)
  })

  it('BR cabeleireiro: taxa adm motor 7% quando 8123 veio 0', () => {
    const line = buildFolhaDraftLine(
      'brasil',
      {
        name: 'Profissional BR Teste',
        role: 'Cabeleireiro',
        charged: 10000,
        service_share: null,
        product_share: null,
        other_share: null,
        tip: null,
        product_spend: null,
        card_fee: null,
        admin_fee: 0,
        assistant_discount: null,
        other_discounts: null,
        net_payable: 5000,
        house_share: null,
      },
      undefined,
      { applyTaxExtras: false },
    )
    expect(line.taxa_administrativa).toBe(700)
    expect(line.taxa_administrativa_rate).toBe(0.07)
    expect(line.proposed_pay).toBe(4300)
  })

  it('Brunna IG: taxa adm 5% (exceção), não 7%', () => {
    const line = buildFolhaDraftLine(
      'iguatemi',
      {
        name: 'Brunna Fabricio Da Silva',
        role: 'Cabeleireiro',
        charged: 10000,
        service_share: null,
        product_share: null,
        other_share: null,
        tip: null,
        product_spend: null,
        card_fee: null,
        admin_fee: 0,
        assistant_discount: null,
        other_discounts: null,
        net_payable: 5000,
        house_share: null,
      },
      undefined,
      { applyTaxExtras: false },
    )
    expect(line.taxa_administrativa).toBe(500)
    expect(line.taxa_administrativa_rate).toBe(0.05)
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
    expect(line.proposed_pay).toBe(6032.64 + 75 + 200 - 30)
  })

  it('U no IG usa taxa 4% (assistente Romeu: sem taxa adm 3% do assistente)', () => {
    const line = buildFolhaDraftLine('iguatemi', jefferson, {
      servicos_assistente_como_pro: 1000,
    })
    expect(line.folha_extras.taxa_servicos).toBe(40)
    expect(line.folha_extras.taxa_adm_assistente).toBeNull()
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
    // jefferson: +meio a meio 75; manicure: admin_fee 8123 −50 → taxa adm 50 (source 8123)
    expect(draft.total_proposed_pay).toBe(6032.64 + 75 + 2350)
    expect(draft.lines[0].name <= draft.lines[1].name).toBe(true)
  })
})

describe('reconstructFatLiquidoFrom8123', () => {
  it('soma a_pagar + magnitudes dos abatimentos', () => {
    const g = reconstructFatLiquidoFrom8123(jefferson)
    expect(g).toBe(6032.64 + 114.12 + 150 + 707.19)
  })
})
