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
    const row = {
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
    }
    const line = buildFolhaDraftLine('iguatemi', row, undefined, {
      applyTaxExtras: false,
    })
    expect(line.taxa_administrativa).toBeCloseTo(2045.134, 2)
    expect(line.meio_a_meio).toBeCloseTo(1450.81, 2)
    expect(line.outros_descontos).toBeCloseTo(387.08, 2)
    expect(line.flags).toContain('taxa_adm_em_descontos')
    expect(line.proposed_pay).toBeCloseTo(9472.05, 2)

    // Fopag: Baru na coluna própria; não reabate (já no a_pagar).
    const withBaru = buildFolhaDraftLine(
      'iguatemi',
      row,
      { consumo_baru: 387.08 },
      { applyTaxExtras: false },
    )
    expect(withBaru.folha_extras.consumo_baru).toBeCloseTo(387.08, 2)
    expect(withBaru.outros_descontos).toBeNull()
    expect(withBaru.proposed_pay).toBeCloseTo(9472.05, 2)
  })

  it('manicure/assistente: descontos = Baru sem embed → coluna Baru, a_pagar intacto', () => {
    const cases: CommissionProfessionalRow[] = [
      {
        name: 'Andressa Erica Batista de Oliveira',
        role: 'Manicure',
        charged: 6449,
        service_share: null,
        product_share: null,
        other_share: null,
        tip: null,
        product_spend: -65.12,
        card_fee: -151.55,
        admin_fee: 0,
        assistant_discount: null,
        other_discounts: -208.71,
        net_payable: 3021.51,
        house_share: null,
      },
      {
        name: 'ARIANE CRISTINA DOS SANTOS',
        role: 'MULTIPLICADOR',
        charged: 26780.5,
        service_share: null,
        product_share: null,
        other_share: null,
        tip: null,
        product_spend: null,
        card_fee: null,
        admin_fee: 0,
        assistant_discount: null,
        other_discounts: -136.26,
        net_payable: 2541.79,
        house_share: null,
      },
    ]
    for (const row of cases) {
      const baru = Math.abs(row.other_discounts ?? 0)
      const bare = buildFolhaDraftLine('iguatemi', row, undefined, {
        applyTaxExtras: false,
      })
      expect(bare.flags).not.toContain('taxa_adm_em_descontos')
      expect(bare.outros_descontos).toBeCloseTo(baru, 2)
      expect(bare.proposed_pay).toBeCloseTo(row.net_payable ?? 0, 2)

      const withBaru = buildFolhaDraftLine(
        'iguatemi',
        row,
        { consumo_baru: baru },
        { applyTaxExtras: false },
      )
      expect(withBaru.folha_extras.consumo_baru).toBeCloseTo(baru, 2)
      expect(withBaru.outros_descontos).toBeNull()
      expect(withBaru.proposed_pay).toBeCloseTo(row.net_payable ?? 0, 2)
    }
  })

  it('BR cabeleireiro: taxa adm motor 5% quando 8123 veio 0', () => {
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
    expect(line.taxa_administrativa).toBe(500)
    expect(line.taxa_administrativa_rate).toBe(0.05)
    expect(line.proposed_pay).toBe(4500)
  })

  it('Alison BR Q2: adm 5% + a_pagar já neteado (descontos=0) → não reabate; +Baru = olerite', () => {
    const row = {
      tip: 0,
      name: 'ALISON ALVAREZ',
      role: 'Cabeleireiro',
      charged: 41399.00002908707,
      card_fee: -588.0097188055515,
      admin_fee: 0,
      house_share: 20825.500014543533,
      net_payable: 14583.246296279132,
      product_share: 0,
      other_share: 0,
      product_spend: -1262.890000499785,
      service_share: 20573.500014543533,
      other_discounts: 0,
      assistant_discount: -4139.3539989590645,
    }
    const bare = buildFolhaDraftLine('brasil', row, undefined, {
      applyTaxExtras: false,
    })
    expect(bare.taxa_administrativa_rate).toBe(0.05)
    expect(bare.taxa_administrativa).toBeCloseTo(2069.95, 1)
    expect(bare.rateio_apos_cartao).toBeCloseTo(19985.48, 1)
    expect(bare.flags).toContain('taxa_adm_em_descontos')
    expect(bare.flags).not.toContain('taxa_adm_motor')
    // a_pagar Avec já fechou adm/meio; falta só Baru do olerite
    expect(bare.proposed_pay).toBeCloseTo(14583.25, 1)

    const withBaru = buildFolhaDraftLine(
      'brasil',
      row,
      { consumo_baru: 324.65 },
      { applyTaxExtras: false },
    )
    expect(withBaru.folha_extras.consumo_baru).toBe(324.65)
    expect(withBaru.proposed_pay).toBeCloseTo(14258.6, 0)
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

  it('U informado deriva V 20% e W 3% BR (conferência; assistente não soma V−W no líquido)', () => {
    const line = buildFolhaDraftLine('brasil', jefferson, {
      servicos_assistente_como_pro: 1000,
    })
    expect(line.folha_extras.valor_a_pagar_profissional).toBe(200)
    expect(line.folha_extras.taxa_servicos).toBe(30)
    // Fopag: U/V/W no assistente são repasse ao pro — líquido = a_pagar + meio
    expect(line.proposed_pay).toBe(6032.64 + 75)
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

  it('Daniel: descontos shortfall W → Tx adm 7% embutida; líquido = a_pagar; com U bate olerite', () => {
    const row = {
      name: 'DANIEL CHABARIBERY',
      role: 'Cabeleireiro',
      charged: 50480.0000038147,
      service_share: 25240.00000190735,
      product_share: 0,
      other_share: 0,
      tip: 0,
      product_spend: -1317.4000057578087,
      card_fee: -688.0939008593559,
      admin_fee: 0,
      assistant_discount: -4704.110007047653,
      other_discounts: -1116.1701164245605,
      net_payable: 17414.22597181797,
      house_share: 25240.00000190735,
    }
    const line = buildFolhaDraftLine('iguatemi', row, undefined, {
      applyTaxExtras: false,
    })
    expect(line.taxa_administrativa).toBeCloseTo(3533.6, 1)
    expect(line.meio_a_meio).toBeCloseTo(2352.055, 2)
    expect(line.rateio_apos_cartao).toBeCloseTo(24551.91, 1)
    expect(line.flags).toContain('taxa_adm_em_descontos')
    expect(line.proposed_pay).toBeCloseTo(17414.23, 2)

    // U = Dailza 420 + Evandro 1220.01 → V 328 − W 65.6 − shortfall ≈ PDF 17611.26
    const withU = buildFolhaDraftLine(
      'iguatemi',
      row,
      { servicos_assistente_como_pro: 1640.01 },
      { applyTaxExtras: false },
    )
    expect(withU.folha_extras.valor_a_pagar_profissional).toBeCloseTo(328.002, 2)
    expect(withU.folha_extras.taxa_servicos).toBeCloseTo(65.6, 1)
    expect(withU.proposed_pay).toBeCloseTo(17611.26, 1)
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
    expect(line.flags).toContain('meta_romeu_pendente')
    expect(line.taxa_administrativa).toBeCloseTo(81.9, 2)
    expect(line.taxa_administrativa_rate).toBe(0.03)
    expect(line.taxa_administrativa_source).toBe('motor')
    expect(line.meio_a_meio).toBeCloseTo(110.5, 2)
    // 748.96 + 110.5 − 81.90 = 777.56
    expect(line.proposed_pay).toBeCloseTo(777.56, 2)
    expect(line.flags).not.toContain('taxa_adm_em_descontos')
  })

  it('Amanda (assistente sem meio): NÃO abate 3%×faturado; proposed = a_pagar', () => {
    const line = buildFolhaDraftLine(
      'iguatemi',
      {
        name: 'AMANDA DOS SANTOS ARAUJO',
        role: 'MULTIPLICADOR',
        charged: 20761.5,
        service_share: 2025.75,
        product_share: null,
        other_share: null,
        tip: 0,
        product_spend: -12.3,
        card_fee: 0,
        admin_fee: 0,
        assistant_discount: null,
        other_discounts: 0,
        net_payable: 2013.45,
        house_share: null,
      },
      undefined,
      { applyTaxExtras: false },
    )
    expect(line.taxa_administrativa).toBeNull()
    expect(line.flags).not.toContain('taxa_adm_motor')
    expect(line.proposed_pay).toBeCloseTo(2013.45, 2)
  })

  it('Rafaella (pro sem assistente): descontos ≈ adm → não reabate 7%', () => {
    const line = buildFolhaDraftLine(
      'iguatemi',
      {
        name: 'Rafaella Edwiges Bernardo Nunes',
        role: 'Cabeleireiro',
        charged: 17112,
        service_share: null,
        product_share: null,
        other_share: null,
        tip: 0,
        product_spend: -20.34,
        card_fee: null,
        admin_fee: 0,
        assistant_discount: null,
        other_discounts: -1197.84,
        net_payable: 8787.75,
        house_share: null,
      },
      undefined,
      { applyTaxExtras: false },
    )
    expect(line.flags).toContain('taxa_adm_em_descontos')
    expect(line.proposed_pay).toBeCloseTo(8787.75, 2)
  })

  it('Brunna Q2 Fopag: crédito (meio−adm)+residual → estorna residual; +V −W −Baru = 68976.53', () => {
    const row = {
      name: 'BRUNNA FABRICIO DA SILVA',
      role: 'Cabeleireiro',
      charged: 125630,
      service_share: 87941,
      product_share: 0,
      other_share: 0,
      tip: 0,
      product_spend: -4693.53,
      card_fee: -3451.49,
      admin_fee: 0,
      assistant_discount: -14313.44,
      other_discounts: 2118.54,
      // a_pagar já inclui crédito descontos 2118.54
      net_payable: 68636.492,
      house_share: 37700,
    }
    const line = buildFolhaDraftLine(
      'iguatemi',
      row,
      {
        servicos_assistente_como_pro: 10500.02,
        consumo_baru: 201.68,
      },
      { applyTaxExtras: false },
    )
    expect(line.flags).toContain('taxa_adm_em_descontos')
    expect(line.taxa_administrativa).toBeCloseTo(6281.5, 1)
    expect(line.meio_a_meio).toBeCloseTo(7156.72, 2)
    expect(line.outros_descontos).toBeCloseTo(1243.32, 2)
    expect(line.folha_extras.valor_a_pagar_profissional).toBeCloseTo(2100.004, 2)
    expect(line.folha_extras.taxa_servicos).toBeCloseTo(315.0006, 3)
    // 68636.492 − 1243.32 + 2100.004 − 315.0006 − 201.68 ≈ 68976.50
    expect(line.proposed_pay).toBeCloseTo(68976.53, 1)
  })

  it('Joanides: crédito (meio−adm)−Baru embutido → líquido = a_pagar', () => {
    const row = {
      name: 'JOANIDES MENDES PONTES JUNIOR',
      role: 'Cabeleireiro',
      charged: 105021.796,
      service_share: 62113.077,
      product_share: 0,
      other_share: null,
      tip: 0,
      product_spend: -1708.8,
      card_fee: -1482.3015,
      admin_fee: 0,
      assistant_discount: -11626.7316,
      other_discounts: 363.18,
      net_payable: 47658.4246,
      house_share: null,
    }
    const line = buildFolhaDraftLine(
      'iguatemi',
      row,
      { consumo_baru: 199.1 },
      { applyTaxExtras: false },
    )
    expect(line.flags).toContain('taxa_adm_em_descontos')
    expect(line.flags).not.toContain('taxa_adm_motor')
    expect(line.taxa_administrativa).toBeCloseTo(5251.09, 1)
    expect(line.folha_extras.consumo_baru).toBeCloseTo(199.1, 1)
    expect(line.outros_descontos).toBeNull()
    expect(line.proposed_pay).toBeCloseTo(47658.42, 1)

    // extras.taxa_administrativa fantasma de rascunho antigo NÃO reabate
    const stale = buildFolhaDraftLine(
      'iguatemi',
      row,
      { consumo_baru: 199.1, taxa_administrativa: 5251.09 },
      { applyTaxExtras: false },
    )
    expect(stale.folha_extras.taxa_administrativa).toBeNull()
    expect(stale.proposed_pay).toBeCloseTo(47658.42, 1)
  })

  it('Romeu Felipe: crédito órfão 8123 + U/V/W = líquido Fopag', () => {
    const line = buildFolhaDraftLine(
      'iguatemi',
      {
        name: 'ROMEU FELIPE',
        role: 'Cabeleireiro',
        charged: 0,
        service_share: 0,
        product_share: 0,
        other_share: null,
        tip: 0,
        product_spend: -683.51,
        card_fee: 0,
        admin_fee: 0,
        assistant_discount: 0,
        other_discounts: 1444.01,
        net_payable: 760.5,
        house_share: null,
      },
      { servicos_assistente_como_pro: 7660.04 },
      { applyTaxExtras: false },
    )
    expect(line.folha_extras.valor_a_pagar_profissional).toBeCloseTo(1532.008, 2)
    expect(line.folha_extras.taxa_servicos).toBeCloseTo(306.4016, 3)
    // 760.5 − 1444.01 + 1532.008 − 306.4016 ≈ 542.10
    expect(line.proposed_pay).toBeCloseTo(542.1, 0)
  })

  it('Diello: 8123 a 50% meio; motor 5% → ajusta delta, não reabate adm/Baru', () => {
    const line = buildFolhaDraftLine(
      'iguatemi',
      {
        name: 'Pedro E F Diello',
        role: 'Cabeleireiro',
        charged: 36950,
        service_share: 18360,
        product_share: 0,
        other_share: null,
        tip: 0,
        product_spend: -1012.96,
        card_fee: -516.2054,
        admin_fee: 0,
        assistant_discount: -4254.6,
        // (adm7% − meio50%) + Baru = 988.72
        other_discounts: -988.72,
        net_payable: 11599.01,
        house_share: null,
      },
      { consumo_baru: 529.52 },
      { applyTaxExtras: false },
    )
    expect(line.meio_a_meio).toBeCloseTo(212.73, 2)
    expect(line.flags).toContain('taxa_adm_em_descontos')
    expect(line.flags).not.toContain('taxa_adm_motor')
    // 11599.01 − (2127.3 − 212.73) = 9684.44
    expect(line.proposed_pay).toBeCloseTo(9684.44, 0)
  })

  it('Romeu Q2: acumulado_mes → top-up meta no líquido; U não altera pay do assistente', () => {
    const base = {
      name: 'GABRIELA DA SILVA SANTOS',
      role: 'MULTIPLICADOR',
      charged: 5676,
      service_share: 1557,
      product_share: 7.3,
      other_share: null,
      tip: 0,
      product_spend: -86.63,
      card_fee: 0,
      admin_fee: 0,
      assistant_discount: -430,
      other_discounts: 67.1,
      net_payable: 1114.77,
      house_share: 3589.7,
    }
    const withU = buildFolhaDraftLine(
      'iguatemi',
      base,
      { servicos_assistente_como_pro: 4930.04 },
      { applyTaxExtras: false },
    )
    // U/V/W ficam na conferência, mas não entram no líquido do assistente
    expect(withU.folha_extras.valor_a_pagar_profissional).toBeCloseTo(986.008, 2)
    expect(withU.proposed_pay).toBeCloseTo(1114.77, 2)

    // Sep IG Gabriela: Total 10230.03 → top-up 1023.003 (10%) no dia 05
    const withMeta = buildFolhaDraftLine(
      'iguatemi',
      base,
      { servicos_assistente_como_pro: 4930.04, acumulado_mes: 10_230.03 },
      { applyTaxExtras: false },
    )
    expect(withMeta.flags).not.toContain('meta_romeu_pendente')
    expect(withMeta.folha_extras.romeu_comissao_parcela).toBeCloseTo(1023.003, 5)
    expect(withMeta.proposed_pay).toBeCloseTo(1114.77 + 1023.003, 2)

    // Q1: top-up não entra (30% já no Avec)
    const q1 = buildFolhaDraftLine(
      'iguatemi',
      base,
      { acumulado_mes: 10_230.03 },
      { applyTaxExtras: true },
    )
    expect(q1.folha_extras.romeu_comissao_parcela).toBeNull()
    expect(q1.proposed_pay).toBeCloseTo(1114.77, 2)

    // Faixa 30%: top-up 0 no Q2
    const lucas = buildFolhaDraftLine(
      'iguatemi',
      { ...base, name: 'LUCAS RODRIGUES DE SOUZA' },
      { acumulado_mes: 4980 },
      { applyTaxExtras: false },
    )
    expect(lucas.folha_extras.romeu_comissao_parcela).toBe(0)
    expect(lucas.proposed_pay).toBeCloseTo(1114.77, 2)
  })

  it('Liria descarta bônus esteticista já gravado nos extras', () => {
    const liria: CommissionProfessionalRow = {
      name: 'Liria Pereira Colman',
      role: 'Esteticista',
      charged: 5968,
      service_share: null,
      product_share: null,
      other_share: null,
      tip: null,
      product_spend: null,
      card_fee: null,
      admin_fee: -417.76,
      assistant_discount: null,
      other_discounts: null,
      net_payable: 2598.12,
      house_share: null,
    }
    const staleBonus = 596.8
    const line = buildFolhaDraftLine('iguatemi', liria, {
      esteticista_bonus: staleBonus,
    })
    expect(line.folha_extras.esteticista_bonus).toBeNull()
    expect(line.proposed_pay).toBeCloseTo(2598.12, 2)

    const kept = buildFolhaDraftLine(
      'iguatemi',
      { ...liria, name: 'Esteticista Teste' },
      { esteticista_bonus: staleBonus },
    )
    expect(kept.folha_extras.esteticista_bonus).toBe(staleBonus)
  })

  it('Brasil Q2: Jefferson 17958.05 → top-up 10%; Gabriela 24700.03 → 20% (faixa, não célula E14)', () => {
    const jeff = buildFolhaDraftLine(
      'brasil',
      {
        name: 'JEFFERSON POLICARPO DOS SANTOS',
        role: 'MULTIPLICADOR',
        charged: null,
        service_share: 500,
        product_share: 0,
        other_share: 0,
        tip: 0,
        product_spend: 0,
        card_fee: 0,
        admin_fee: 0,
        assistant_discount: 0,
        other_discounts: 0,
        net_payable: 2000,
        house_share: 1000,
      },
      { acumulado_mes: 17_958.05 },
      { applyTaxExtras: false },
    )
    expect(jeff.folha_extras.romeu_comissao_parcela).toBeCloseTo(1795.805, 5)
    // Path B só com meio; aqui descontos=0 e sem meio → não inventa 3%×charged
    expect(jeff.proposed_pay).toBeCloseTo(2000 + 1795.805, 2)

    const gabi = buildFolhaDraftLine(
      'brasil',
      {
        name: 'GABRIELA DA SILVA SANTOS',
        role: 'MULTIPLICADOR',
        charged: null,
        service_share: 6000,
        product_share: 0,
        other_share: 0,
        tip: 0,
        product_spend: 0,
        card_fee: 0,
        admin_fee: 0,
        assistant_discount: 0,
        other_discounts: 0,
        net_payable: 3000,
        house_share: 15000,
      },
      { acumulado_mes: 24_700.03, servicos_assistente_como_pro: 21_290.03 },
      { applyTaxExtras: false },
    )
    expect(gabi.folha_extras.romeu_comissao_parcela).toBeCloseTo(4940.006, 5)
    // U/V/W conferência (W BR=3%); líquido = a_pagar + top-up
    expect(gabi.folha_extras.taxa_servicos).toBeCloseTo(21_290.03 * 0.03, 2)
    expect(gabi.proposed_pay).toBeCloseTo(3000 + 4940.006, 2)
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
