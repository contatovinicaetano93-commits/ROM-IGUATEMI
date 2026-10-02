import { describe, expect, it } from 'vitest'
import { buildFolhaDraftLine } from '@/lib/folha/draft-from-8123'
import {
  BR_ASSISTANT_AS_PRO_ADMIN_TAX,
  resolveAssistantAdminTaxRate,
} from '@/lib/folha/exceptions'
import type { CommissionProfessionalRow } from '@/lib/salon/commission-metrics'

function row(
  p: Partial<CommissionProfessionalRow> & { name: string },
): CommissionProfessionalRow {
  return {
    name: p.name,
    role: p.role ?? null,
    charged: p.charged ?? null,
    service_share: p.service_share ?? null,
    product_share: p.product_share ?? null,
    other_share: p.other_share ?? null,
    tip: p.tip ?? null,
    product_spend: p.product_spend ?? null,
    card_fee: p.card_fee ?? null,
    admin_fee: p.admin_fee ?? 0,
    assistant_discount: p.assistant_discount ?? null,
    other_discounts: p.other_discounts ?? null,
    net_payable: p.net_payable ?? null,
    house_share: p.house_share ?? null,
  }
}

describe('BR multiplicador: adm = U×2% (Fopag Av. Brasil)', () => {
  it('alíquota BR 2% / IG 3%', () => {
    expect(resolveAssistantAdminTaxRate('brasil', null)).toBe(
      BR_ASSISTANT_AS_PRO_ADMIN_TAX,
    )
    expect(resolveAssistantAdminTaxRate('iguatemi', null)).toBe(0.03)
  })

  it('Islayquiel: não inventa charged×3%; adm=U×2%; líquido Fopag', () => {
    // 8123 a_pagar ≈ G − produto − desc.assist; motor + meio − adm(U×2%).
    // Fopag Y cacheado 3301.4 (sem −W; motor assistente-like também zera W).
    const line = buildFolhaDraftLine(
      'brasil',
      row({
        name: 'Islayquiel Rodrigues de Sena',
        role: 'MULTIPLICADOR',
        charged: 31276,
        product_spend: -80,
        assistant_discount: -80,
        net_payable: 3457.4 - 80 - 80,
      }),
      { servicos_assistente_como_pro: 1800 },
      { applyTaxExtras: false },
    )
    expect(line.taxa_administrativa).toBeCloseTo(36, 2)
    expect(line.taxa_administrativa_rate).toBe(0.02)
    expect(line.folha_extras.taxa_adm_assistente).toBeCloseTo(36, 2)
    expect(line.folha_extras.taxa_servicos).toBeCloseTo(54, 2)
    expect(line.proposed_pay).toBeCloseTo(3301.4, 1)
  })

  it('Islayquiel recibo Avec: other=0 sem U NÃO congela líquido (crédita meio)', () => {
    // PDF olerite 16–30/09: rateio 3457.40 −80 −80 = 3297.40 no 8123;
    // + meio 40 − adm 36 = 3301.40. Sem U o motor não inventa J; só +meio.
    const line = buildFolhaDraftLine(
      'brasil',
      row({
        name: 'Islayquiel Rodrigues de Sena',
        role: 'MULTIPLICADOR',
        charged: 2404,
        service_share: 3427.2,
        product_share: 30.2,
        product_spend: -80,
        assistant_discount: -80,
        admin_fee: 0,
        other_discounts: 0,
        net_payable: 3297.4,
      }),
      undefined,
      { applyTaxExtras: false },
    )
    expect(line.flags).not.toContain('taxa_adm_em_descontos')
    expect(line.meio_a_meio).toBeCloseTo(40, 2)
    expect(line.taxa_administrativa).toBeNull()
    expect(line.proposed_pay).toBeCloseTo(3337.4, 1)
  })

  it('Islayquiel recibo Avec: com U=1800 → Total a Receber 3301.40', () => {
    const line = buildFolhaDraftLine(
      'brasil',
      row({
        name: 'Islayquiel Rodrigues de Sena',
        role: 'MULTIPLICADOR',
        charged: 31276,
        service_share: 3427.2,
        product_share: 30.2,
        product_spend: -80,
        assistant_discount: -80,
        admin_fee: 0,
        other_discounts: 0,
        net_payable: 3297.4,
      }),
      { servicos_assistente_como_pro: 1800 },
      { applyTaxExtras: false },
    )
    expect(line.taxa_administrativa).toBeCloseTo(36, 2)
    expect(line.taxa_administrativa_rate).toBe(0.02)
    expect(line.meio_a_meio).toBeCloseTo(40, 2)
    expect(line.proposed_pay).toBeCloseTo(3301.4, 1)
    expect(line.flags).toContain('taxa_adm_motor')
    expect(line.flags).not.toContain('taxa_adm_em_descontos')
  })

  it('Marcelo Sabino: adm=U×2%; Baru abate; líquido Fopag', () => {
    // 8123 a_pagar ≈ G − produto − desc.assist; + meio − adm − Baru = Y.
    const line = buildFolhaDraftLine(
      'brasil',
      row({
        name: 'MARCELO SABINO LUIS JUNIOR',
        role: 'MULTIPLICADOR',
        charged: 31129.5,
        product_spend: -31.33,
        assistant_discount: -40,
        net_payable: 4990.34 - 31.33 - 40,
      }),
      { servicos_assistente_como_pro: 5550, consumo_baru: 275.31 },
      { applyTaxExtras: false },
    )
    expect(line.taxa_administrativa).toBeCloseTo(111, 2)
    expect(line.taxa_administrativa_rate).toBe(0.02)
    expect(line.folha_extras.taxa_adm_assistente).toBeCloseTo(111, 2)
    expect(line.folha_extras.taxa_servicos).toBeCloseTo(166.5, 2)
    expect(line.proposed_pay).toBeCloseTo(4552.7, 1)
  })

  it('Auricaliane: Y = G − J + V(earn 30%) − W − diversos', () => {
    const line = buildFolhaDraftLine(
      'brasil',
      row({
        name: 'AURICALIANE DA SILVA DANTAS',
        role: 'MULTIPLICADOR',
        charged: 3438.72,
        net_payable: 2879.65,
      }),
      {
        servicos_assistente_como_pro: 3304,
        descontos_diversos: 77.05,
      },
      { applyTaxExtras: false },
    )
    expect(line.exception_id).toBe('auricaliane')
    expect(line.folha_extras.valor_a_pagar_profissional).toBeCloseTo(991.2, 1)
    expect(line.folha_extras.taxa_servicos).toBeCloseTo(99.12, 1)
    expect(line.taxa_administrativa).toBeCloseTo(66.08, 1)
    expect(line.proposed_pay).toBeCloseTo(3628.6, 1)
  })
})
