/**
 * Desmembra o quadro Descontos e Bônus do olerite Avec a partir do 8123.
 *
 * O report 8123 frequentemente zera `taxa_adm` e embute em `descontos`:
 *   (TAXA ADM − MEIO A MEIO) + outros (CONSUMO BARU, etc.)
 * Ex. Ana Matsumoto: 981.40 = 2045.13 − 1450.81 + 387.08
 * Ex. Amauri Baptista: 449.90 = 638.40 − 188.50 (+ 0 outros)
 */

import { roundFolha } from '@/lib/folha/calc'

function mag(value: number | null | undefined): number | null {
  if (value == null || Number.isNaN(value)) return null
  return Math.abs(value)
}

export type OleriteDisaggregate = {
  /** True se `descontos` cobre pelo menos (adm − meio). */
  embeddedAdminMeio: boolean
  /** Taxa adm para coluna (conferência olerite). */
  taxaAdm: number | null
  /** Meio a meio (crédito) para coluna. */
  meioAMeio: number | null
  /**
   * Residual de `descontos` após tirar (adm − meio): BARU e afins.
   * null se não há residual material.
   */
  outrosResiduais: number | null
  /** Magnitude bruta de `descontos` 8123. */
  descontos8123: number | null
}

/**
 * Rateio após cartão — espelha “Total Rateio” do olerite quando
 * service_share ≈ faturado/2 e cartão vem separado no 8123.
 */
export function rateioAposCartao(args: {
  charged: number | null
  serviceShare: number | null
  cardFee: number | null | undefined
}): number | null {
  const card = mag(args.cardFee) ?? 0
  if (args.serviceShare != null) {
    return roundFolha(args.serviceShare - card, 4)
  }
  if (args.charged == null) return null
  return roundFolha(args.charged / 2 - card, 4)
}

export function disaggregateOleriteDescontos(args: {
  charged: number | null
  adminFee8123: number | null | undefined
  assistantDiscount: number | null | undefined
  otherDiscounts: number | null | undefined
  adminRate: number | null
  meioRate: number
}): OleriteDisaggregate {
  const assist = mag(args.assistantDiscount)
  const meioAMeio =
    assist == null ? null : roundFolha(assist * args.meioRate, 4)
  const descontos8123 = mag(args.otherDiscounts)
  const from8123Adm = mag(args.adminFee8123)

  let taxaAdm: number | null = null
  if (from8123Adm != null && from8123Adm > 0) {
    taxaAdm = roundFolha(from8123Adm, 4)
  } else if (args.adminRate != null && args.charged != null) {
    taxaAdm = roundFolha(args.charged * args.adminRate, 4)
  }

  const admMinusMeio =
    taxaAdm != null && meioAMeio != null ? taxaAdm - meioAMeio : null

  const embeddedAdminMeio =
    descontos8123 != null &&
    admMinusMeio != null &&
    admMinusMeio > 0.005 &&
    descontos8123 + 0.05 >= admMinusMeio

  let outrosResiduais: number | null = null
  if (descontos8123 != null) {
    if (embeddedAdminMeio && admMinusMeio != null) {
      const residual = roundFolha(descontos8123 - admMinusMeio, 4)
      outrosResiduais = residual != null && residual > 0.02 ? residual : null
    } else if (!embeddedAdminMeio && descontos8123 > 0.02) {
      // Descontos que não são o net adm−meio — mostrar integrais como “outros”.
      outrosResiduais = descontos8123
    }
  }

  return {
    embeddedAdminMeio,
    taxaAdm,
    meioAMeio,
    outrosResiduais,
    descontos8123,
  }
}
