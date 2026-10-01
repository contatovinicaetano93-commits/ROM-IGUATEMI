import { describe, expect, it } from 'vitest'
import { buildFolhaDraftLine } from '@/lib/folha/draft-from-8123'
import {
  applyExtrasToDraftLines,
  canTransitionFolhaStatus,
  refreshDraftPreservingExtras,
} from '@/lib/folha/workflow'
import type { CommissionProfessionalRow } from '@/lib/salon/commission-metrics'

const pro: CommissionProfessionalRow = {
  name: 'JEFFERSON POLICARPO DOS SANTOS',
  role: 'MULTIPLICADOR',
  charged: 12000,
  service_share: null,
  product_share: null,
  other_share: null,
  tip: null,
  product_spend: -100,
  card_fee: null,
  admin_fee: null,
  assistant_discount: -200,
  other_discounts: null,
  net_payable: 5000,
  house_share: null,
}

describe('canTransitionFolhaStatus', () => {
  it('permite draft → ready_for_review → approved → paid', () => {
    expect(canTransitionFolhaStatus('draft', 'ready_for_review')).toBe(true)
    expect(canTransitionFolhaStatus('ready_for_review', 'approved')).toBe(true)
    expect(canTransitionFolhaStatus('approved', 'paid')).toBe(true)
  })

  it('bloqueia paid → draft', () => {
    expect(canTransitionFolhaStatus('paid', 'draft')).toBe(false)
  })

  it('permite reabrir approved → draft', () => {
    expect(canTransitionFolhaStatus('approved', 'draft')).toBe(true)
  })
})

describe('applyExtrasToDraftLines', () => {
  it('aplica U e recalcula proposed_pay', () => {
    const line = buildFolhaDraftLine('brasil', pro)
    const result = applyExtrasToDraftLines({
      panel: 'brasil',
      lines: [line],
      sourceProfessionals: [pro],
      professionalName: pro.name,
      extras: { servicos_assistente_como_pro: 1000, darf: 50 },
    })
    expect(result.matched).toBe(true)
    expect(result.lines[0]?.folha_extras.valor_a_pagar_profissional).toBe(200)
    expect(result.lines[0]?.folha_extras.taxa_servicos).toBe(30)
    expect(result.lines[0]?.proposed_pay).toBe(5000 + 200 - 30 - 50)
  })
})

describe('refreshDraftPreservingExtras', () => {
  it('mantém DARF após refresh do 8123', () => {
    const previous = buildFolhaDraftLine('brasil', pro, { darf: 99 })
    const refreshed = refreshDraftPreservingExtras({
      panel: 'brasil',
      referenceDay: '2026-05-15',
      professionals: [{ ...pro, net_payable: 5100 }],
      previousLines: [previous],
    })
    expect(refreshed.lines[0]?.folha_extras.darf).toBe(99)
    expect(refreshed.lines[0]?.avec.net_payable).toBe(5100)
    expect(refreshed.lines[0]?.proposed_pay).toBe(5100 - 99)
  })
})
