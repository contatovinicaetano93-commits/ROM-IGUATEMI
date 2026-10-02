/**
 * Regressão: recibos Avec fechados (Q2 16–30/09/2026) × motor.
 * Fontes: PDFs Impressão de recibo + Neon folha_periods 2026-09-q2.
 */
import { describe, expect, it } from 'vitest'
import { buildFolhaDraftLine } from '@/lib/folha/draft-from-8123'
import type { CommissionProfessionalRow } from '@/lib/salon/commission-metrics'

/** Snapshot Neon IG Q2 — ANA CRISTINA MATSUMOTO */
const ana: CommissionProfessionalRow = {
  tip: 0,
  name: 'ANA CRISTINA MATSUMOTO',
  role: 'Cabeleireiro',
  charged: 29216.200035095215,
  card_fee: -412.8979979157448,
  admin_fee: 0,
  house_share: 14608.100017547607,
  net_payable: 9472.05207413435,
  other_share: 0,
  product_share: 0,
  product_spend: -840.130010843277,
  service_share: 14608.100017547607,
  other_discounts: -981.3999328613281,
  assistant_discount: -2901.6200017929077,
}

/** Snapshot Neon IG Q2 — DANIEL CHABARIBERY */
const daniel: CommissionProfessionalRow = {
  tip: 0,
  name: 'DANIEL CHABARIBERY',
  role: 'Cabeleireiro',
  charged: 50480.0000038147,
  card_fee: -688.0939008593559,
  admin_fee: 0,
  house_share: 25240.00000190735,
  net_payable: 17414.22597181797,
  other_share: 0,
  product_share: 0,
  product_spend: -1317.4000057578087,
  service_share: 25240.00000190735,
  other_discounts: -1116.1701164245605,
  assistant_discount: -4704.110007047653,
}

/** Snapshot Neon IG Q2 — GABRIELA (double space no 8123) */
const gabriela: CommissionProfessionalRow = {
  tip: 0,
  name: 'GABRIELA DA SILVA  SANTOS',
  role: 'MULTIPLICADOR',
  charged: 5075.9999895095825,
  card_fee: 0,
  admin_fee: 0,
  house_share: 3589.699990749359,
  net_payable: 1114.769995689392,
  other_share: 0,
  product_share: 7.299999713897705,
  product_spend: -86.63000106811523,
  service_share: 1556.9999990463257,
  other_discounts: 67.10000610351562,
  assistant_discount: -430.0000081062317,
}

/** Snapshot Neon IG Q2 — CARINA */
const carina: CommissionProfessionalRow = {
  tip: 0,
  name: 'CARINA FERNANDA DE FREITAS FERREIRA',
  role: 'Cabeleireiro',
  charged: 21594.00001859665,
  card_fee: -256.48199901357293,
  admin_fee: 0,
  house_share: 11079.600009083748,
  net_payable: 6599.698064800352,
  other_share: 0,
  product_share: 31.399999737739563,
  product_spend: -1195.6200083196163,
  service_share: 10483.000009775162,
  other_discounts: -560.5599365234375,
  assistant_discount: -1902.0400008559227,
}

describe('olerite recibos Q2 × motor', () => {
  it('Ana Cristina: recibo 9472.05 — Baru já no other; motor não reabate', () => {
    const line = buildFolhaDraftLine(
      'iguatemi',
      ana,
      { consumo_baru: 387.08 },
      { applyTaxExtras: false },
    )
    expect(line.proposed_pay).toBeCloseTo(9472.05, 1)
    expect(line.taxa_administrativa).toBeCloseTo(2045.13, 1)
    expect(line.meio_a_meio).toBeCloseTo(1450.81, 1)
    expect(line.folha_extras.consumo_baru).toBeCloseTo(387.08, 2)
  })

  it('Daniel Chabaribery: U/V/W no pro → recibo 17611.26', () => {
    const line = buildFolhaDraftLine(
      'iguatemi',
      daniel,
      { servicos_assistente_como_pro: 1640.01 },
      { applyTaxExtras: false },
    )
    expect(line.folha_extras.valor_a_pagar_profissional).toBeCloseTo(328.002, 2)
    expect(line.folha_extras.taxa_servicos).toBeCloseTo(65.6004, 2)
    expect(line.proposed_pay).toBeCloseTo(17611.26, 1)
  })

  it('Gabriela Santos: recibo 1114.77; Folha Q2 + top-up Romeu', () => {
    const sem = buildFolhaDraftLine('iguatemi', gabriela, undefined, {
      applyTaxExtras: false,
    })
    expect(sem.proposed_pay).toBeCloseTo(1114.77, 1)

    const com = buildFolhaDraftLine(
      'iguatemi',
      gabriela,
      { acumulado_mes: 10230.03 },
      { applyTaxExtras: false },
    )
    expect(com.folha_extras.romeu_comissao_parcela).toBeCloseTo(1023.003, 1)
    expect(com.proposed_pay).toBeCloseTo(2137.77, 1)
  })

  it('Carina: motor = Fopag 6127 (não o PDF 5946 com bases inconsistentes)', () => {
    const line = buildFolhaDraftLine(
      'iguatemi',
      carina,
      { consumo_baru: 472.48 },
      { applyTaxExtras: false },
    )
    expect(line.proposed_pay).toBeCloseTo(6127.22, 1)
    expect(Math.abs((line.proposed_pay ?? 0) - 5946.28)).toBeGreaterThan(100)
  })
})
