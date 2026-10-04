import { describe, expect, it } from 'vitest'
import { buildFolhaDraftLine } from '@/lib/folha/draft-from-8123'
import { overlayClosedFopagExtras } from '@/lib/folha/fopag-extras-overlay'
import { rehydrateFolhaDraftFromPeriod } from '@/lib/folha/workflow'
import type { CommissionProfessionalRow } from '@/lib/salon/commission-metrics'

function avecRow(
  name: string,
  role: string,
  fields: Partial<CommissionProfessionalRow> &
    Pick<CommissionProfessionalRow, 'charged' | 'net_payable'>,
): CommissionProfessionalRow {
  return {
    name,
    role,
    service_share: null,
    product_share: null,
    other_share: null,
    tip: null,
    product_spend: null,
    card_fee: null,
    admin_fee: 0,
    assistant_discount: null,
    other_discounts: null,
    house_share: null,
    ...fields,
  }
}

describe('overlayClosedFopagExtras', () => {
  it('não mexe em rascunho 8123 puro (sem referência Fopag)', () => {
    const source = avecRow('AMAURI BAPTISTA BEZERRA', 'Cabeleireiro', {
      charged: 9120,
      net_payable: 3482.29,
    })
    const line = buildFolhaDraftLine('iguatemi', source)
    const { changed, lines } = overlayClosedFopagExtras({
      panel: 'iguatemi',
      periodId: '2026-09-q2',
      lines: [line],
    })
    expect(changed).toBe(false)
    expect(lines[0]?.folha_extras.servicos_assistente_como_pro).toBeNull()
  })

  it('Caio: Baru sticky some quando a Fopag IG não tem Baru', () => {
    const source = avecRow('CAIO DE LIMA CARVALHO', 'MULTIPLICADOR', {
      charged: 16166.5,
      product_spend: -26,
      net_payable: 1870.51,
    })
    const stale = buildFolhaDraftLine(
      'iguatemi',
      source,
      {
        consumo_baru: 200,
        liquido_referencia: 1670.51,
        faturado_referencia: 16166.5,
        fat_liquido_referencia: 1896.51,
        produto_referencia: 26,
      },
      { applyTaxExtras: false },
    )
    const { lines } = rehydrateFolhaDraftFromPeriod('iguatemi', {
      id: '2026-09-q2',
      year_month: '2026-09',
      half: 2,
      to_day: '2026-09-30',
      reference_day: '2026-10-05',
      lines: [stale],
      source_professionals: [source],
    })
    expect(lines[0]?.folha_extras.consumo_baru).toBeNull()
    expect(lines[0]?.proposed_pay).toBeCloseTo(1870.51, 0)
  })

  it('Brunna: mantém U da Fopag IG', () => {
    const source = avecRow('BRUNNA FABRICIO DA SILVA', 'Cabeleireiro', {
      charged: 105000,
      net_payable: 68976.53,
    })
    const line = buildFolhaDraftLine(
      'iguatemi',
      source,
      {
        servicos_assistente_como_pro: 999,
        liquido_referencia: 68976.5334,
        faturado_referencia: 105000,
        fat_liquido_referencia: 68976.5334,
      },
      { applyTaxExtras: false },
    )
    const { lines } = overlayClosedFopagExtras({
      panel: 'iguatemi',
      periodId: '2026-09-q2',
      lines: [line],
    })
    expect(lines[0]?.folha_extras.servicos_assistente_como_pro).toBeCloseTo(
      10500.02,
      1,
    )
  })

  it('Amauri: U sticky de cabeleireiro (Fopag U=0) sai do extra', () => {
    const source = avecRow('AMAURI BAPTISTA BEZERRA', 'Cabeleireiro', {
      charged: 9120,
      product_spend: -133.51,
      assistant_discount: -377,
      net_payable: 3932.19,
    })
    const stale = buildFolhaDraftLine(
      'iguatemi',
      source,
      {
        servicos_assistente_como_pro: 8000,
        liquido_referencia: 3482.29,
        fat_liquido_referencia: 4442.7,
        faturado_referencia: 9120,
        produto_referencia: 133.51,
      },
      { applyTaxExtras: false },
    )
    const { lines } = rehydrateFolhaDraftFromPeriod('iguatemi', {
      id: '2026-09-q2',
      year_month: '2026-09',
      half: 2,
      to_day: '2026-09-30',
      reference_day: '2026-10-05',
      lines: [stale],
      source_professionals: [source],
    })
    expect(lines[0]?.folha_extras.servicos_assistente_como_pro).toBeNull()
  })
})
