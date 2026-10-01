/**
 * Desmembra o quadro Descontos e Bônus do olerite Avec a partir do 8123.
 *
 * Profissional (cabeleireiro etc.): `descontos` costuma embutir
 *   (TAXA ADM 7% − MEIO A MEIO) + outros (CONSUMO BARU, …)
 *   Ex. Ana: 981.40 = 2045.13 − 1450.81 + 387.08
 *
 * Assistente / multiplicador atuando como pro:
 *   A) `descontos` ≈ meio − adm 3% (crédito) — Gabriela: +67.10 = 215 − 147.90
 *      → a_pagar já fechou; não recreditar meio nem reabater adm.
 *   B) `descontos` = 0 e taxa_adm 8123 = 0 — Lucas: adm = charged × 3%
 *      → a_pagar ainda sem meio/adm; proposed = a_pagar + meio − adm.
 *   C) `descontos` ≈ +meio — meio já no a_pagar; só falta abater adm 3%.
 */

import { roundFolha } from '@/lib/folha/calc'

function mag(value: number | null | undefined): number | null {
  if (value == null || Number.isNaN(value)) return null
  return Math.abs(value)
}

export type OleriteDisaggregate = {
  /**
   * True se `descontos` já neteia adm↔meio (a_pagar fechado).
   * Não recreditar meio / não reabater adm no proposed_pay.
   */
  embeddedAdminMeio: boolean
  /**
   * True se o crédito meio já entrou no a_pagar (via descontos ≈ +meio)
   * sem a taxa adm correspondente — não recreditar meio.
   */
  meioCreditedInNet: boolean
  /** Taxa adm para coluna (conferência olerite). */
  taxaAdm: number | null
  /** Meio a meio (crédito) para coluna. */
  meioAMeio: number | null
  /**
   * Residual de `descontos` após desmembrar adm↔meio (ex.: BARU).
   * null se não há residual material.
   */
  outrosResiduais: number | null
  /** Valor assinado de `descontos` 8123 (crédito pode ser > 0). */
  descontos8123Signed: number | null
}

/**
 * Rateio / comissão após cartão.
 * Profissional: service_share ≈ faturado/2 − cartão no olerite.
 * Assistente: service_share já é a comissão (30/40/50%).
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
  /** Manter sinal: assistente-como-pro pode vir crédito (+). */
  otherDiscounts: number | null | undefined
  /** Alíquota adm sobre faturado C (7%/5%) — null para assistente/multiplicador. */
  adminRate: number | null
  meioRate: number
  /**
   * Alíquota adm do assistente sobre serviços que executou como pro (sempre 3%,
   * incl. Romeu). null = não aplicar caminho assistente.
   */
  assistantAdminRate?: number | null
}): OleriteDisaggregate {
  const assist = mag(args.assistantDiscount)
  const meioAMeio =
    assist == null ? null : roundFolha(assist * args.meioRate, 4)
  const signedOther =
    args.otherDiscounts == null || Number.isNaN(args.otherDiscounts)
      ? null
      : args.otherDiscounts
  const from8123AdmRaw = mag(args.adminFee8123)
  /** 8123 às vezes manda 0 em vez de null — tratar zero como ausente. */
  const from8123Adm =
    from8123AdmRaw != null && from8123AdmRaw > 0 ? from8123AdmRaw : null

  // --- Caminho assistente-como-pro ---
  if (
    args.assistantAdminRate != null &&
    args.adminRate == null &&
    from8123Adm == null
  ) {
    const expectedAdm =
      args.charged != null
        ? roundFolha(args.charged * args.assistantAdminRate, 4)
        : null

    // A) descontos ≈ meio − adm 3% (Gabriela)
    if (meioAMeio != null && signedOther != null) {
      const impliedAdm = roundFolha(meioAMeio - signedOther, 4)
      if (impliedAdm != null && impliedAdm > 0.02) {
        const maxAdm =
          expectedAdm != null ? expectedAdm + 1 : impliedAdm + 1
        if (impliedAdm <= maxAdm) {
          return {
            embeddedAdminMeio: true,
            meioCreditedInNet: true,
            taxaAdm: impliedAdm,
            meioAMeio,
            outrosResiduais: null,
            descontos8123Signed: signedOther,
          }
        }
      }

      // C) descontos ≈ +meio — meio já no a_pagar; adm = charged × 3%
      if (
        expectedAdm != null &&
        expectedAdm > 0.02 &&
        Math.abs(signedOther - meioAMeio) <= 0.05
      ) {
        return {
          embeddedAdminMeio: false,
          meioCreditedInNet: true,
          taxaAdm: expectedAdm,
          meioAMeio,
          outrosResiduais: null,
          descontos8123Signed: signedOther,
        }
      }
    }

    // B) descontos 0/ausente — adm = charged × 3% (Lucas Q2).
    // Não aplicar se `descontos` tem outro valor material (evita falso positivo
    // em linhas com descontos não relacionados à taxa adm).
    const otherIsAbsentOrZero =
      signedOther == null || Math.abs(signedOther) <= 0.02
    if (otherIsAbsentOrZero && expectedAdm != null && expectedAdm > 0.02) {
      return {
        embeddedAdminMeio: false,
        meioCreditedInNet: false,
        taxaAdm: expectedAdm,
        meioAMeio,
        outrosResiduais: null,
        descontos8123Signed: signedOther,
      }
    }
  }

  // --- Caminho profissional: descontos (mag) ≈ (adm − meio) + residual ---
  let taxaAdm: number | null = null
  if (from8123Adm != null) {
    taxaAdm = roundFolha(from8123Adm, 4)
  } else if (args.adminRate != null && args.charged != null) {
    taxaAdm = roundFolha(args.charged * args.adminRate, 4)
  }

  const otherMag = signedOther == null ? null : Math.abs(signedOther)
  const admMinusMeio =
    taxaAdm != null && meioAMeio != null ? taxaAdm - meioAMeio : null

  const embeddedAdminMeio =
    otherMag != null &&
    admMinusMeio != null &&
    admMinusMeio > 0.005 &&
    otherMag + 0.05 >= admMinusMeio

  let outrosResiduais: number | null = null
  if (otherMag != null) {
    if (embeddedAdminMeio && admMinusMeio != null) {
      const residual = roundFolha(otherMag - admMinusMeio, 4)
      outrosResiduais = residual != null && residual > 0.02 ? residual : null
    } else if (!embeddedAdminMeio && otherMag > 0.02) {
      outrosResiduais = otherMag
    }
  }

  return {
    embeddedAdminMeio,
    meioCreditedInNet: embeddedAdminMeio,
    taxaAdm,
    meioAMeio,
    outrosResiduais,
    descontos8123Signed: signedOther,
  }
}
