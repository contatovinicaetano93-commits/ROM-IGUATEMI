/**
 * Rascunho Folha — motor FOPAG ROM (apresentações RH 27/10/2026).
 * proposed_pay = passos 1–6 (Avec + alíquota Planilha Base) ± manuais.
 */
import { describe, expect, it } from 'vitest'
import {
  buildFolhaDraftFrom8123,
  buildFolhaDraftLine,
  deriveReport041From8123,
  proposePayFromFopagRom,
} from '@/lib/folha/draft-from-8123'
import { roundFopagRom } from '@/lib/folha/fopag-rom-calc'
import type { CommissionProfessionalRow } from '@/lib/salon/commission-metrics'

function pro(
  partial: Partial<CommissionProfessionalRow> & { name: string },
): CommissionProfessionalRow {
  return {
    name: partial.name,
    role: partial.role ?? 'Cabeleireiro',
    charged: partial.charged ?? null,
    service_share: partial.service_share ?? null,
    product_share: partial.product_share ?? null,
    other_share: partial.other_share ?? null,
    tip: partial.tip ?? null,
    product_spend: partial.product_spend ?? null,
    card_fee: partial.card_fee ?? null,
    admin_fee: partial.admin_fee ?? null,
    assistant_discount: partial.assistant_discount ?? null,
    other_discounts: partial.other_discounts ?? null,
    net_payable: partial.net_payable ?? null,
    house_share: partial.house_share ?? null,
  }
}

describe('deriveReport041From8123', () => {
  it('inverte taxa 5% do rateio de produtos', () => {
    expect(deriveReport041From8123(100)).toBeCloseTo(2000, 5)
  })
  it('sem rateio → 0', () => {
    expect(deriveReport041From8123(null)).toBe(0)
  })
})

describe('proposePayFromFopagRom — PDF exemplo via 8123', () => {
  it('FL/LP com alíquota 50% e manuais', () => {
    // 0123=20000, 041=2000 → product_share = 100; 029=-400; 026=-300
    const pay = proposePayFromFopagRom({
      panel: 'brasil',
      name: 'ADRIANA ROSA DE JESUS ABRANCHES', // 50% na Planilha Base
      charged: 20_000,
      productShare: 100,
      cardFee: -400,
      productSpend: -300,
      extras: {
        parc: null,
        darf: null,
        das: 100,
        div_ativa: null,
        mensalidade_contabilidade: null,
        descontos_diversos: null,
        consumo_baru: 50,
        produtos_black: null,
        servicos_assistente_como_pro: null,
        valor_a_pagar_profissional: null,
        taxa_servicos: null,
        taxa_administrativa: null,
        esteticista_bonus: null,
        romeu_comissao_parcela: null,
        devolucao_taxa_adm_q1: null,
        acumulado_mes: null,
        faturado_mes: null,
        faturado_mesmo_periodo_ano_anterior: null,
        taxa_adm_q1: null,
        liquido_referencia: null,
        fat_liquido_referencia: null,
        faturado_referencia: null,
      },
    })
    // LP padrão 10000 − DAS 100 − Baru 50 = 9850
    expect(roundFopagRom(pay, 2)).toBe(9_850)
  })

  it('sem alíquota RH → null', () => {
    const pay = proposePayFromFopagRom({
      panel: 'brasil',
      name: 'PROFISSIONAL INEXISTENTE XYZ',
      charged: 10_000,
      productShare: 0,
      cardFee: -100,
      productSpend: null,
      extras: {
        parc: null,
        darf: null,
        das: null,
        div_ativa: null,
        mensalidade_contabilidade: null,
        descontos_diversos: null,
        consumo_baru: null,
        produtos_black: null,
        servicos_assistente_como_pro: null,
        valor_a_pagar_profissional: null,
        taxa_servicos: null,
        taxa_administrativa: null,
        esteticista_bonus: null,
        romeu_comissao_parcela: null,
        devolucao_taxa_adm_q1: null,
        acumulado_mes: null,
        faturado_mes: null,
        faturado_mesmo_periodo_ano_anterior: null,
        taxa_adm_q1: null,
        liquido_referencia: null,
        fat_liquido_referencia: null,
        faturado_referencia: null,
      },
    })
    expect(pay).toBeNull()
  })
})

describe('buildFolhaDraftLine — FOPAG ROM', () => {
  it('Alan BR 55%: proposed_pay pelo motor, não pelo a_pagar', () => {
    const line = buildFolhaDraftLine(
      'brasil',
      pro({
        name: 'ALAN FERNADO DE ALBUQUERQUE',
        role: 'Cabeleireiro',
        charged: 20_000,
        product_share: 100,
        card_fee: -400,
        product_spend: -300,
        net_payable: 1, // a_pagar ignorado pelo motor novo
      }),
    )
    // salão 45% → FL 11400 − 300 − 200 = 10900
    expect(line.proposed_pay).toBeCloseTo(10_900, 2)
  })

  it('impostos/Baru digitados abatem', () => {
    const line = buildFolhaDraftLine(
      'brasil',
      pro({
        name: 'ALAN FERNADO DE ALBUQUERQUE',
        charged: 20_000,
        product_share: 100,
        card_fee: -400,
        product_spend: null,
        net_payable: 9999,
      }),
      { das: 200, consumo_baru: 50 },
    )
    // FL 11400 − meio 200 = 11200 − 200 − 50 = 10950
    expect(line.proposed_pay).toBeCloseTo(10_950, 2)
  })
})

describe('buildFolhaDraftFrom8123', () => {
  it('monta rascunho com nomes da Planilha Base', () => {
    const draft = buildFolhaDraftFrom8123({
      panel: 'brasil',
      referenceDay: '2026-09-15',
      professionals: [
        pro({
          name: 'ALAN FERNADO DE ALBUQUERQUE',
          charged: 10_000,
          product_share: 0,
          card_fee: -100,
          net_payable: 50,
        }),
      ],
    })
    expect(draft.source).toBe('8123')
    expect(draft.line_count).toBe(1)
    expect(draft.lines[0].proposed_pay).not.toBeNull()
    expect(draft.total_proposed_pay).not.toBeNull()
  })
})
