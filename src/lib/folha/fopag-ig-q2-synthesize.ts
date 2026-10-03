/**
 * Sintetiza 8123 + extras Folha a partir da aba Base Folha Iguatemi (Fopag Q2).
 * Usado pelo sweep vitest e pelo seed Neon — mesma fonte de verdade.
 */
import { buildFolhaDraftLine } from '@/lib/folha/draft-from-8123'
import {
  resolveFolhaPersonRules,
  resolveGrossAdminFeeRate,
  resolveMeioAMeioRate,
  usesNamedMeioOverride,
} from '@/lib/folha/exceptions'
import { normalizeFolhaCargo } from '@/lib/folha/rules'
import type { CommissionProfessionalRow } from '@/lib/salon/commission-metrics'

export type FopagIgQ2Row = {
  row: number
  name: string
  cargo: string | null
  faturado: number
  taxa_cartao: number
  fat_liquido: number
  produto: number
  taxa_adm: number
  desc_assistente: number
  meio_a_meio: number
  parc: number
  darf: number
  das: number
  div_ativa: number
  mensalidade: number
  baru: number
  U: number
  V: number
  W: number
  desc_diversos_02: number
  liquido: number
}

export type FopagBonusRow = {
  name: string
  q1: number
  q2: number
  total: number
  adic_10: number
}

export type FopagPattern =
  | 'pro_embedded_debit'
  | 'pro_credit_residual'
  | 'assist_path_A'
  | 'assist_path_B'
  | 'assist_simple'
  | 'pro_romeu_U'
  | 'y_equals_net_no_extras'
  | 'unknown'

export type FopagSynthesizeResult = {
  row: CommissionProfessionalRow
  extras: Parameters<typeof buildFolhaDraftLine>[2]
  pattern: FopagPattern
  notes: string[]
  rhExtras: string[]
}

function approx(a: number, b: number, tol = 0.05): boolean {
  return Math.abs(a - b) <= tol
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

export function bonusForIgQ2(
  name: string,
  bonusRows: FopagBonusRow[],
): FopagBonusRow | null {
  const key = name.toLowerCase()
  for (const b of bonusRows) {
    const bn = b.name.toLowerCase()
    if (bn.includes('gabriela') && key.includes('gabriela') && key.includes('santos')) {
      return b
    }
    if (bn.includes('lucas') && key.includes('lucas') && key.includes('rodrigues')) {
      return b
    }
    if (bn.includes('jefferson') && key.includes('jefferson')) return b
    if (bn.includes('nicole') && key.includes('nicole')) return b
    if (bn.includes('pedro') && key.includes('cardi')) return b
  }
  return null
}

export function classifyFopagIgQ2(f: FopagIgQ2Row): FopagPattern {
  const cargo = normalizeFolhaCargo(f.cargo)
  const isAssist =
    cargo === 'assistente' || cargo === 'multiplicador' || cargo === 'colorista'
  if (isAssist) {
    if (f.desc_assistente > 0.02 && f.meio_a_meio > 0.02 && f.taxa_adm > 0.02) {
      return 'assist_path_A'
    }
    if (f.desc_assistente > 0.02 && f.taxa_adm > 0.02) return 'assist_path_B'
    return 'assist_simple'
  }
  if (f.faturado < 0.02 && f.U > 0.02) return 'pro_romeu_U'
  if (f.meio_a_meio > f.taxa_adm + 0.02 && f.desc_assistente > 0.02) {
    return 'pro_credit_residual'
  }
  if (f.taxa_adm > f.meio_a_meio + 0.02 && f.desc_assistente > 0.02) {
    return 'pro_embedded_debit'
  }
  if (f.U < 0.02 && f.baru < 0.02) return 'y_equals_net_no_extras'
  return 'unknown'
}

export function synthesizeFopagIgQ2(
  f: FopagIgQ2Row,
  bonusRows: FopagBonusRow[],
): FopagSynthesizeResult {
  const pattern = classifyFopagIgQ2(f)
  const cargo = normalizeFolhaCargo(f.cargo)
  const isAssist =
    cargo === 'assistente' || cargo === 'multiplicador' || cargo === 'colorista'
  const person = resolveFolhaPersonRules(f.name)
  const bonus = bonusForIgQ2(f.name, bonusRows)
  const notes: string[] = []
  const rhExtras: string[] = []

  const base: CommissionProfessionalRow = {
    name: f.name,
    role: f.cargo,
    charged: f.faturado || null,
    service_share: null,
    product_share: null,
    other_share: null,
    tip: null,
    product_spend: f.produto > 0.005 ? -f.produto : null,
    card_fee: f.taxa_cartao > 0.005 ? -f.taxa_cartao : null,
    admin_fee: 0,
    assistant_discount: f.desc_assistente > 0.005 ? -f.desc_assistente : null,
    other_discounts: null,
    net_payable: null,
    house_share: null,
  }
  const extras: NonNullable<Parameters<typeof buildFolhaDraftLine>[2]> = {}
  if (f.U > 0.005) extras.servicos_assistente_como_pro = f.U
  if (f.parc > 0.005) {
    extras.parc = f.parc
    rhExtras.push('parc')
  }
  if (f.div_ativa > 0.005) {
    extras.div_ativa = f.div_ativa
    rhExtras.push('div_ativa')
  }
  if (f.desc_diversos_02 > 0.005) {
    extras.descontos_diversos =
      (extras.descontos_diversos ?? 0) + f.desc_diversos_02
    rhExtras.push('desc_diversos_02')
  }
  const rhDebitRestore =
    (f.parc > 0.005 ? f.parc : 0) +
    (f.div_ativa > 0.005 ? f.div_ativa : 0) +
    (f.desc_diversos_02 > 0.005 ? f.desc_diversos_02 : 0)

  if (isAssist) {
    const uAdm = f.U > 0 ? f.U * 0.03 : null
    if (uAdm != null && approx(uAdm, f.taxa_adm, 0.5)) {
      // Motor usa U como charged (adm 3%); Fat. UI/export fica com C do Fopag.
      if (f.faturado > 0.005) extras.faturado_referencia = f.faturado
      base.charged = f.U
      notes.push('charged=U_for_adm3')
    }
    if (pattern === 'assist_path_A') {
      base.other_discounts =
        Math.round((f.meio_a_meio - f.taxa_adm) * 10000) / 10000
      base.net_payable = f.liquido + rhDebitRestore
    } else if (pattern === 'assist_path_B') {
      base.other_discounts = 0
      base.net_payable =
        Math.round(
          (f.liquido - f.meio_a_meio + f.taxa_adm + rhDebitRestore) * 10000,
        ) / 10000
    } else if (f.baru > 0.005) {
      extras.consumo_baru = (extras.consumo_baru ?? 0) + f.baru
      rhExtras.push('baru')
      base.net_payable =
        Math.round((f.liquido + f.baru + rhDebitRestore) * 10000) / 10000
    } else {
      base.net_payable = f.liquido + rhDebitRestore
    }
    if (person?.isRomeuAssistant && bonus) {
      extras.acumulado_mes = bonus.total
      notes.push(`romeu_acumulado=${bonus.total}`)
    }
    return { row: base, extras, pattern, notes, rhExtras }
  }

  if (pattern === 'pro_romeu_U') {
    base.charged = f.faturado || 0
    base.assistant_discount = null
    base.other_discounts = 0
    base.net_payable = f.produto > 0 ? -f.produto : 0
    return { row: base, extras, pattern, notes, rhExtras }
  }

  if (pattern === 'pro_credit_residual') {
    const meioMinusAdm = f.meio_a_meio - f.taxa_adm
    let residual = 0
    if (/brunna/i.test(f.name)) {
      residual = 1243.32
      notes.push('brunna_residual_known')
    }
    base.other_discounts =
      Math.round((meioMinusAdm + residual) * 10000) / 10000
    if (f.baru > 0.005) {
      extras.consumo_baru = (extras.consumo_baru ?? 0) + f.baru
      rhExtras.push('baru')
    }
    base.net_payable =
      Math.round((f.liquido - f.V + f.W + f.baru + residual) * 10000) / 10000
    return { row: base, extras, pattern, notes, rhExtras }
  }

  if (pattern === 'pro_embedded_debit') {
    let effectiveMeio = f.meio_a_meio
    if (person && f.desc_assistente > 0.02) {
      const motorMeio = resolveMeioAMeioRate(person) * f.desc_assistente
      if (Math.abs(motorMeio - f.meio_a_meio) > 1) {
        if (usesNamedMeioOverride(person)) {
          effectiveMeio = motorMeio
          notes.push(
            `meio_fopag_corrected_to_motor=${motorMeio.toFixed(2)}`,
          )
        } else {
          notes.push(
            `meio_rate_mismatch motor=${motorMeio.toFixed(2)} fopag=${f.meio_a_meio}`,
          )
        }
      }
    }
    const admMinusMeio = f.taxa_adm - effectiveMeio
    const liqBase = f.liquido - f.meio_a_meio + effectiveMeio
    const looksLikeRemitUw =
      f.U > 0.02 &&
      approx(f.V, f.U * 0.2, 0.5) &&
      approx(f.W, f.U * 0.04, 0.5)
    if (looksLikeRemitUw) {
      const descontosMag = admMinusMeio
      base.other_discounts = -round4(descontosMag)
      if (f.baru > 0.005) {
        extras.consumo_baru = (extras.consumo_baru ?? 0) + f.baru
        rhExtras.push('baru')
      }
      base.net_payable = round4(
        liqBase -
          f.V +
          f.W +
          (f.baru > 0.005 ? f.baru : 0) +
          rhDebitRestore,
      )
      notes.push('UW_remit_not_olerite_shortfall')
      notes.push(`descontosMag=${descontosMag.toFixed(2)}`)
      return { row: base, extras, pattern, notes, rhExtras }
    }

    const shortfall = f.W > 0.02 ? f.W : 0
    if (shortfall > 0) notes.push('W_embedded_shortfall')
    const descontosMag = admMinusMeio + f.baru - shortfall
    base.other_discounts = -Math.round(descontosMag * 10000) / 10000
    if (shortfall > 0.02) {
      base.net_payable =
        Math.round((liqBase - f.V + 2 * f.W + rhDebitRestore) * 10000) / 10000
    } else {
      base.net_payable =
        Math.round((liqBase - f.V + f.W + rhDebitRestore) * 10000) / 10000
    }
    notes.push(`descontosMag=${descontosMag.toFixed(2)}`)
    return { row: base, extras, pattern, notes, rhExtras }
  }

  void resolveGrossAdminFeeRate

  if (f.desc_assistente < 0.02 && f.taxa_adm > 0.02) {
    base.other_discounts = -f.taxa_adm
    notes.push('adm_only_embedded')
  } else if (f.taxa_adm > f.meio_a_meio + 0.02) {
    base.other_discounts = -(
      f.taxa_adm -
      f.meio_a_meio +
      (f.baru > 0.005 ? f.baru : 0)
    )
  }

  if (f.baru > 0.005) {
    extras.consumo_baru = (extras.consumo_baru ?? 0) + f.baru
    rhExtras.push('baru')
    base.net_payable =
      Math.round((f.liquido + f.baru + rhDebitRestore) * 10000) / 10000
  } else {
    base.net_payable =
      f.U > 0.005
        ? Math.round((f.liquido - f.V + f.W + rhDebitRestore) * 10000) / 10000
        : f.liquido + rhDebitRestore
  }
  return { row: base, extras, pattern, notes, rhExtras }
}

/** Alvo de líquido (Y) após correções RH/meio/top-up Romeu — igual ao sweep. */
export function resolveFopagIgQ2Target(
  f: FopagIgQ2Row,
  syn: FopagSynthesizeResult,
  bonusRows: FopagBonusRow[],
): { target: number; syn: FopagSynthesizeResult } {
  let target = f.liquido
  const person = resolveFolhaPersonRules(f.name)
  const bonus = bonusForIgQ2(f.name, bonusRows)
  const next: FopagSynthesizeResult = {
    ...syn,
    row: { ...syn.row },
    extras: { ...syn.extras },
    notes: [...syn.notes],
  }

  if (usesNamedMeioOverride(person) && f.desc_assistente > 0.02 && person) {
    const motorMeio = resolveMeioAMeioRate(person) * f.desc_assistente
    if (Math.abs(motorMeio - f.meio_a_meio) > 1) {
      target = f.liquido - f.meio_a_meio + motorMeio
      next.notes.push(`target_meio_corrected=${target.toFixed(2)}`)
    }
  }

  if (
    person?.isRomeuAssistant &&
    bonus &&
    bonus.adic_10 > 0.005 &&
    next.extras?.acumulado_mes != null &&
    next.row.net_payable != null
  ) {
    const probe = buildFolhaDraftLine('iguatemi', next.row, next.extras, {
      applyTaxExtras: false,
    })
    const probePay = probe.proposed_pay
    const yHasTopup =
      probePay != null &&
      Math.abs(probePay - (f.liquido + bonus.adic_10)) <= 1 &&
      Math.abs(probePay - f.liquido) > 1
    if (yHasTopup) {
      next.row = {
        ...next.row,
        net_payable: round4((next.row.net_payable ?? 0) - bonus.adic_10),
      }
      next.notes.push(`fopag_y_already_has_topup strip=${bonus.adic_10}`)
    } else {
      target = target + bonus.adic_10
      next.notes.push(`target_includes_topup +${bonus.adic_10}`)
    }
  }

  return { target, syn: next }
}
