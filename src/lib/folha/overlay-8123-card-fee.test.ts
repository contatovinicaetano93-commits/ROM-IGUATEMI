import { describe, expect, it } from 'vitest'
import { buildFolhaDraftLine } from '@/lib/folha/draft-from-8123'
import { rateioAposCartao } from '@/lib/folha/olerite-disaggregate'
import {
  canPersistCardFeeOverlay,
  overlayMissing8123CardFee,
  sourceMissingCardFee,
} from '@/lib/folha/overlay-8123-card-fee'
import type { CommissionProfessionalRow } from '@/lib/salon/commission-metrics'

function row(
  partial: Partial<CommissionProfessionalRow> & Pick<CommissionProfessionalRow, 'name'>,
): CommissionProfessionalRow {
  return {
    role: 'Cabeleireiro',
    charged: null,
    service_share: null,
    product_share: null,
    other_share: null,
    tip: null,
    product_spend: null,
    card_fee: null,
    admin_fee: 0,
    assistant_discount: null,
    other_discounts: null,
    net_payable: null,
    house_share: null,
    ...partial,
  }
}

describe('sourceMissingCardFee', () => {
  it('true só quando há faturado e card_fee ausente', () => {
    expect(sourceMissingCardFee([row({ name: 'A', charged: 1000 })])).toBe(true)
    expect(sourceMissingCardFee([row({ name: 'A', charged: 1000, card_fee: -10 })])).toBe(
      false,
    )
    expect(sourceMissingCardFee([row({ name: 'A', charged: null })])).toBe(false)
  })
})

describe('canPersistCardFeeOverlay', () => {
  it('grava em rascunho aberto; não reescreve aprovado/pago', () => {
    expect(canPersistCardFeeOverlay('draft')).toBe(true)
    expect(canPersistCardFeeOverlay('ready_for_review')).toBe(true)
    expect(canPersistCardFeeOverlay('awaiting_rules')).toBe(true)
    expect(canPersistCardFeeOverlay('approved')).toBe(false)
    expect(canPersistCardFeeOverlay('paid')).toBe(false)
  })
})

describe('overlayMissing8123CardFee', () => {
  it('copia card_fee 8123 e preserva rateio charged/2 (seed Fopag BR)', () => {
    const fopag = row({
      name: 'ALISON ALVAREZ',
      charged: 41399,
      product_spend: -1262.89,
      assistant_discount: -4139.35,
      net_payable: 14583.24,
    })
    const avec = row({
      name: 'ALISON ALVAREZ',
      charged: 41399,
      service_share: 20573.5,
      card_fee: -588.01,
      net_payable: 14583.25,
    })
    const { rows, changed } = overlayMissing8123CardFee([fopag], [avec])
    expect(changed).toBe(true)
    expect(rows[0]?.card_fee).toBe(-588.01)
    expect(rows[0]?.net_payable).toBe(14583.24)
    const rateioBefore = rateioAposCartao({
      charged: fopag.charged,
      serviceShare: fopag.service_share,
      cardFee: fopag.card_fee,
    })
    const rateioAfter = rateioAposCartao({
      charged: rows[0]!.charged,
      serviceShare: rows[0]!.service_share,
      cardFee: rows[0]!.card_fee,
    })
    expect(rateioAfter).toBeCloseTo(rateioBefore ?? 0, 4)
    expect(rateioAfter).toBeCloseTo(41399 / 2, 4)

    const extras = { consumo_baru: 324.65 }
    const before = buildFolhaDraftLine('brasil', fopag, extras, { applyTaxExtras: false })
    const after = buildFolhaDraftLine('brasil', rows[0]!, extras, { applyTaxExtras: false })
    expect(after.avec.card_fee).toBe(-588.01)
    expect(after.proposed_pay).toBeCloseTo(before.proposed_pay ?? 0, 2)
  })

  it('não usa a coluna Fopag BR (1183) no lugar do 8123 (588)', () => {
    const fopagTaxaCartao = 1183.31
    const avecCard = -588.01
    const { rows } = overlayMissing8123CardFee(
      [row({ name: 'ALISON ALVAREZ', charged: 41399 })],
      [row({ name: 'ALISON ALVAREZ', charged: 41399, card_fee: avecCard })],
    )
    expect(rows[0]?.card_fee).toBe(avecCard)
    expect(Math.abs(rows[0]!.card_fee!)).not.toBeCloseTo(fopagTaxaCartao, 0)
  })

  it('não sobrescreve card_fee já presente', () => {
    const { changed, rows } = overlayMissing8123CardFee(
      [row({ name: 'Ana', charged: 1000, card_fee: -12 })],
      [row({ name: 'Ana', charged: 1000, card_fee: -99 })],
    )
    expect(changed).toBe(false)
    expect(rows[0]?.card_fee).toBe(-12)
  })
})
