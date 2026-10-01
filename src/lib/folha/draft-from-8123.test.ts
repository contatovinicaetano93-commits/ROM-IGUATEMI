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

  it('IG: taxa_adm=0 mas descontos já neteiam adm−meio → exibe 7%, não reabate', () => {
    // Carina-shaped: other = adm − meio (560.56 = 1511.58 − 951.02)
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
    expect(line.meio_a_meio).toBeCloseTo(951.02, 2)
    expect(line.flags).toContain('taxa_adm_em_descontos')
    expect(line.flags).not.toContain('taxa_adm_motor')
    // a_pagar Avec já fechado — não +meio nem −adm de novo
    expect(line.proposed_pay).toBeCloseTo(6599.6981, 3)
  })

  it('Ana Matsumoto IG: recibo 9472 com adm embutida em descontos', () => {
    const line = buildFolhaDraftLine(
      'iguatemi',
      {
        name: 'ANA CRISTINA MATSUMOTO',
        role: 'Cabeleireiro',
        charged: 29216.2,
        service_share: 14608.1,
        product_share: 0,
        other_share: null,
        tip: 0,
        product_spend: -840.13,
        card_fee: -412.9,
        admin_fee: 0,
        assistant_discount: -2901.62,
        // 387.08 (BARU) + 2045.13 (adm) − 1450.81 (meio)
        other_discounts: -981.4,
        net_payable: 9472.05,
        house_share: 14608.1,
      },
      undefined,
      { applyTaxExtras: false },
    )
    expect(line.taxa_administrativa).toBeCloseTo(2045.134, 2)
    expect(line.meio_a_meio).toBeCloseTo(1450.81, 2)
    expect(line.flags).toContain('taxa_adm_em_descontos')
    expect(line.proposed_pay).toBeCloseTo(9472.05, 2)
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

  it('U no IG: W 4% e taxa adm assistente 3% (incl. Romeu)', () => {
    const line = buildFolhaDraftLine('iguatemi', jefferson, {
      servicos_assistente_como_pro: 1000,
    })
    expect(line.folha_extras.taxa_servicos).toBe(40)
    expect(line.folha_extras.taxa_adm_assistente).toBe(30)
  })

  it('Gabriela Romeu: descontos = meio − adm 3%; líquido = a_pagar (sem recreditar meio)', () => {
    const line = buildFolhaDraftLine(
      'iguatemi',
      {
        name: 'GABRIELA DA SILVA SANTOS',
        role: 'MULTIPLICADOR',
        charged: 5076,
        service_share: 1557,
        product_share: 7.3,
        other_share: null,
        tip: 0,
        product_spend: -86.63,
        card_fee: 0,
        admin_fee: 0,
        assistant_discount: -430,
        // +67.10 = 215 (meio) − 147.90 (taxa adm 3%)
        other_discounts: 67.1,
        net_payable: 1114.77,
        house_share: 3589.7,
      },
      undefined,
      { applyTaxExtras: false },
    )
    expect(line.flags).toContain('assistente_romeu')
    expect(line.taxa_administrativa).toBeCloseTo(147.9, 1)
    expect(line.taxa_administrativa_rate).toBe(0.03)
    expect(line.meio_a_meio).toBeCloseTo(215, 1)
    expect(line.flags).toContain('taxa_adm_em_descontos')
    expect(line.proposed_pay).toBeCloseTo(1114.77, 2)
  })

  it('Lucas Romeu: descontos=0 → Tx adm 81.90 (3% de 2730); proposed = a_pagar + meio − adm', () => {
    const line = buildFolhaDraftLine(
      'iguatemi',
      {
        name: 'LUCAS RODRIGUES DE SOUZA',
        role: 'MULTIPLICADOR',
        charged: 2730,
        service_share: 1044.0000014305115,
        product_share: 0,
        other_share: 0,
        tip: 0,
        product_spend: -74.04000253975391,
        card_fee: 0,
        admin_fee: 0,
        assistant_discount: -221,
        other_discounts: 0,
        net_payable: 748.9599988907576,
        house_share: 1911,
      },
      undefined,
      { applyTaxExtras: false },
    )
    expect(line.flags).toContain('assistente_romeu')
    expect(line.taxa_administrativa).toBeCloseTo(81.9, 2)
    expect(line.taxa_administrativa_rate).toBe(0.03)
    expect(line.taxa_administrativa_source).toBe('motor')
    expect(line.meio_a_meio).toBeCloseTo(110.5, 2)
    // 748.96 + 110.5 − 81.90 = 777.56
    expect(line.proposed_pay).toBeCloseTo(777.56, 2)
    expect(line.flags).not.toContain('taxa_adm_em_descontos')
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
