import { describe, expect, it } from 'vitest'
import {
  disaggregateOleriteDescontos,
  rateioAposCartao,
} from '@/lib/folha/olerite-disaggregate'
import { buildFolhaDraftLine } from '@/lib/folha/draft-from-8123'
import { rehydrateFolhaDraftFromPeriod } from '@/lib/folha/workflow'

describe('disaggregateOleriteDescontos', () => {
  it('Ana Matsumoto: desmembra adm + meio + BARU a partir de descontos', () => {
    const d = disaggregateOleriteDescontos({
      charged: 29216.2,
      adminFee8123: 0,
      assistantDiscount: -2901.62,
      otherDiscounts: -981.4,
      adminRate: 0.07,
      meioRate: 0.5,
    })
    expect(d.embeddedAdminMeio).toBe(true)
    expect(d.taxaAdm).toBeCloseTo(2045.134, 2)
    expect(d.meioAMeio).toBeCloseTo(1450.81, 2)
    expect(d.outrosResiduais).toBeCloseTo(387.08, 2)
  })

  it('Amauri Baptista: other = adm − meio (sem residual)', () => {
    const d = disaggregateOleriteDescontos({
      charged: 9120,
      adminFee8123: 0,
      assistantDiscount: -377,
      otherDiscounts: -449.9,
      adminRate: 0.07,
      meioRate: 0.5,
    })
    expect(d.embeddedAdminMeio).toBe(true)
    expect(d.embeddedShortfall).toBeNull()
    expect(d.taxaAdm).toBeCloseTo(638.4, 2)
    expect(d.meioAMeio).toBeCloseTo(188.5, 2)
    expect(d.outrosResiduais).toBeNull()
  })

  it('Daniel Chabaribery: descontos ≈ (adm − meio) − W → embutido com shortfall', () => {
    const d = disaggregateOleriteDescontos({
      charged: 50480,
      adminFee8123: 0,
      assistantDiscount: -4704.11,
      otherDiscounts: -1116.17,
      adminRate: 0.07,
      meioRate: 0.5,
      serviceTaxRate: 0.04,
    })
    expect(d.embeddedAdminMeio).toBe(true)
    expect(d.taxaAdm).toBeCloseTo(3533.6, 1)
    expect(d.meioAMeio).toBeCloseTo(2352.055, 2)
    expect(d.embeddedShortfall).toBeCloseTo(65.37, 1)
    expect(d.outrosResiduais).toBeNull()
  })

  it('Gabriela Santos: descontos crédito = meio − adm 3%', () => {
    const d = disaggregateOleriteDescontos({
      charged: 5076,
      adminFee8123: 0,
      assistantDiscount: -430,
      otherDiscounts: 67.1,
      adminRate: null,
      meioRate: 0.5,
      assistantAdminRate: 0.03,
    })
    expect(d.embeddedAdminMeio).toBe(true)
    expect(d.meioCreditedInNet).toBe(true)
    expect(d.taxaAdm).toBeCloseTo(147.9, 1)
    expect(d.meioAMeio).toBeCloseTo(215, 1)
    expect(d.outrosResiduais).toBeNull()
  })

  it('Lucas Rodrigues: descontos=0 → adm = charged × 3% (não embutido)', () => {
    const d = disaggregateOleriteDescontos({
      charged: 2730,
      adminFee8123: 0,
      assistantDiscount: -221,
      otherDiscounts: 0,
      adminRate: null,
      meioRate: 0.5,
      assistantAdminRate: 0.03,
    })
    expect(d.embeddedAdminMeio).toBe(false)
    expect(d.meioCreditedInNet).toBe(false)
    expect(d.taxaAdm).toBeCloseTo(81.9, 2)
    expect(d.meioAMeio).toBeCloseTo(110.5, 2)
  })

  it('Lucas Q1: descontos ≈ +meio → meio já no a_pagar; adm = charged × 3%', () => {
    const d = disaggregateOleriteDescontos({
      charged: 2250,
      adminFee8123: 0,
      assistantDiscount: -85,
      otherDiscounts: 42.5,
      adminRate: null,
      meioRate: 0.5,
      assistantAdminRate: 0.03,
    })
    expect(d.embeddedAdminMeio).toBe(false)
    expect(d.meioCreditedInNet).toBe(true)
    expect(d.taxaAdm).toBeCloseTo(67.5, 2)
    expect(d.meioAMeio).toBeCloseTo(42.5, 2)
  })
})

describe('rateioAposCartao', () => {
  it('Ana: service_share − cartão = Total Rateio do recibo', () => {
    expect(
      rateioAposCartao({
        charged: 29216.2,
        serviceShare: 14608.1,
        cardFee: -412.9,
      }),
    ).toBeCloseTo(14195.2, 2)
  })
})

describe('buildFolhaDraftLine olerite columns', () => {
  it('Amauri: exibe tx adm 638.40, rateio após cartão, líquido intacto', () => {
    const line = buildFolhaDraftLine(
      'iguatemi',
      {
        name: 'AMAURI BAPTISTA BEZERRA',
        role: 'Cabeleireiro',
        charged: 9120.000015258789,
        service_share: 4560.0000076293945,
        product_share: 0,
        other_share: null,
        tip: 0,
        product_spend: -133.51000082492828,
        card_fee: -117.2999997138977,
        admin_fee: 0,
        assistant_discount: -376.9999990463257,
        other_discounts: -449.9000244140625,
        net_payable: 3482.2899836301804,
        house_share: 4560.0000076293945,
      },
      undefined,
      { applyTaxExtras: false },
    )
    expect(line.taxa_administrativa).toBeCloseTo(638.4, 1)
    expect(line.meio_a_meio).toBeCloseTo(188.5, 1)
    expect(line.outros_descontos).toBeNull()
    expect(line.rateio_apos_cartao).toBeCloseTo(4442.7, 1)
    expect(line.proposed_pay).toBeCloseTo(3482.29, 2)
    expect(line.flags).toContain('taxa_adm_em_descontos')
  })
})

describe('rehydrateFolhaDraftFromPeriod', () => {
  it('rascunho antigo sem taxa_administrativa passa a exibir adm desmembrada', () => {
    const stale = {
      name: 'AMAURI BAPTISTA BEZERRA',
      cargo_raw: 'Cabeleireiro',
      cargo: 'cabeleireiro' as const,
      avec: {
        tip: 0,
        charged: 9120,
        card_fee: -117.3,
        admin_fee: 0,
        house_share: 4560,
        net_payable: 3482.29,
        product_share: 0,
        product_spend: -133.51,
        service_share: 4560,
        other_discounts: -449.9,
        assistant_discount: -377,
      },
      meio_a_meio: 188.5,
      meio_a_meio_rate: 0.5,
      // campos novos ausentes no JSON antigo
      folha_extras: {
        das: null,
        darf: null,
        parc: null,
        div_ativa: null,
        taxa_servicos: null,
        produtos_black: null,
        esteticista_bonus: null,
        descontos_diversos: null,
        mensalidade_contabilidade: null,
        valor_a_pagar_profissional: null,
        servicos_assistente_como_pro: null,
        taxa_adm_assistente: null,
        taxa_administrativa: null,
      },
      proposed_pay: 3482.29,
      formula_y_preview: null,
      flags: ['assistente_com_desconto' as const],
      exception_id: null,
      taxa_administrativa: null as unknown as number | null,
      taxa_administrativa_rate: null as unknown as number | null,
      taxa_administrativa_source: null as unknown as '8123' | 'motor' | null,
      outros_descontos: null,
      rateio_apos_cartao: null,
    }

    const { lines } = rehydrateFolhaDraftFromPeriod('iguatemi', {
      half: 2,
      to_day: '2026-09-30',
      reference_day: '2026-09-30',
      lines: [stale],
      source_professionals: [],
    })
    expect(lines[0]?.taxa_administrativa).toBeCloseTo(638.4, 1)
    expect(lines[0]?.rateio_apos_cartao).toBeCloseTo(4442.7, 1)
    expect(lines[0]?.proposed_pay).toBeCloseTo(3482.29, 2)
  })

  it('Daniel Q2: rascunho antigo sem taxa_adm → embute shortfall W e não reabate 7%', () => {
    const stale = {
      name: 'DANIEL CHABARIBERY',
      cargo_raw: 'Cabeleireiro',
      cargo: 'cabeleireiro' as const,
      avec: {
        tip: 0,
        charged: 50480.0000038147,
        card_fee: -688.0939008593559,
        admin_fee: 0,
        house_share: 25240.00000190735,
        net_payable: 17414.22597181797,
        product_share: 0,
        product_spend: -1317.4000057578087,
        service_share: 25240.00000190735,
        other_discounts: -1116.1701164245605,
        assistant_discount: -4704.110007047653,
      },
      meio_a_meio: 2352.055,
      meio_a_meio_rate: 0.5,
      folha_extras: {
        das: null,
        darf: null,
        parc: null,
        div_ativa: null,
        taxa_servicos: null,
        produtos_black: null,
        esteticista_bonus: null,
        descontos_diversos: null,
        mensalidade_contabilidade: null,
        valor_a_pagar_profissional: null,
        servicos_assistente_como_pro: null,
        taxa_adm_assistente: null,
        taxa_administrativa: null,
      },
      proposed_pay: 17414.226,
      formula_y_preview: null,
      flags: ['assistente_com_desconto' as const],
      exception_id: null,
      taxa_administrativa: null as unknown as number | null,
      taxa_administrativa_rate: null as unknown as number | null,
      taxa_administrativa_source: null as unknown as '8123' | 'motor' | null,
      outros_descontos: null,
      rateio_apos_cartao: null,
    }

    const { lines } = rehydrateFolhaDraftFromPeriod('iguatemi', {
      half: 2,
      to_day: '2026-09-30',
      reference_day: '2026-09-30',
      lines: [stale],
      source_professionals: [],
    })
    expect(lines[0]?.taxa_administrativa).toBeCloseTo(3533.6, 1)
    expect(lines[0]?.rateio_apos_cartao).toBeCloseTo(24551.91, 1)
    expect(lines[0]?.proposed_pay).toBeCloseTo(17414.23, 2)
    expect(lines[0]?.flags).toContain('taxa_adm_em_descontos')
    expect(lines[0]?.flags).not.toContain('taxa_adm_motor')
  })
})
