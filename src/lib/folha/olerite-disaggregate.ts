/**
 * Desmembra o quadro Descontos e Bônus do olerite Avec a partir do 8123.
 *
 * Profissional (cabeleireiro etc.): `descontos` costuma embutir
 *   (TAXA ADM − MEIO A MEIO) + outros (CONSUMO BARU, …)
 *   IG 7% / BR 5%. Ex. Ana IG: 981.40 = 2045.13 − 1450.81 + 387.08
 *   BR às vezes zera `descontos` e já neteia adm/meio no `a_pagar` (Alison).
 *
 * Assistente / multiplicador atuando como pro:
 *   A) `descontos` ≈ meio − adm 3% (crédito) — Gabriela: +67.10 = 215 − 147.90
 *      → a_pagar já fechou; não recreditar meio nem reabater adm.
 *   B) `descontos` = 0 e taxa_adm 8123 = 0 — Lucas: adm = charged × 3%
 *      → a_pagar ainda sem meio/adm; proposed = a_pagar + meio − adm.
 *   C) `descontos` ≈ +meio — meio já no a_pagar; só falta abater adm 3%.
 *
 * Profissional: `descontos` ≈ (adm − meio) + residual (Ana/Amauri).
 * Às vezes o 8123 embute W (taxa serviços 3%/4%) reduzindo o débito —
 * Daniel: 1116 ≈ 1181 − 65 (W). Continua embutido; shortfall compensa no pay.
 *
 * Quando meio > adm (ex.: Brunna 5%): `descontos` vem como **crédito**
 * ≈ (meio − adm) + residual. Gildenice: +109.82 ≈ 2892.87 − 2783.06.
 * Brunna: +2118.54 = 875.22 + 1243.32 (residual a estornar no pay).
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
  /**
   * Quando `descontos` ≈ (adm − meio) − W, o a_pagar fica alto demais em W.
   * Magnitude do shortfall (para compensar ao aplicar taxa_servicos).
   */
  embeddedShortfall: number | null
  /**
   * Crédito residual em `descontos` além de (meio − adm). a_pagar já somou
   * esse crédito — estornar no proposed_pay (Brunna).
   */
  embeddedCreditResidual: number | null
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

/**
 * Quando o residual olerite (após adm↔meio) já é o Consumo Baru do 8123,
 * a coluna Baru é só conferência — não reabater no proposed_pay nem
 * duplicar em Outros.
 *
 * Alison BR (descontos=0, a_pagar já neteou adm/meio): residual null →
 * Baru do RH/Zig ainda abate.
 */
export function resolveBaruVsOleriteResidual(args: {
  /** Residual após desmembrar adm↔meio (coluna Outros bruta). */
  outrosResiduais: number | null
  /** Consumo Baru informado (RH / Zig / Fopag). */
  consumoBaru: number | null | undefined
  /**
   * True se `descontos` já neteou adm↔meio (a_pagar fechou o residual).
   * Sem isso, residual/Baru ainda precisa abater.
   */
  residualAlreadyInNet: boolean
}): {
  /** Coluna Outros (null se residual = Baru). */
  outrosDescontos: number | null
  /** Coluna / extras Consumo Baru. */
  consumoBaru: number | null
  /** True → não subtrair consumo_baru de novo no proposed_pay. */
  baruAlreadyInNet: boolean
} {
  const residual =
    args.outrosResiduais != null && args.outrosResiduais > 0.02
      ? args.outrosResiduais
      : null
  const baru =
    args.consumoBaru != null &&
    !Number.isNaN(args.consumoBaru) &&
    args.consumoBaru > 0.02
      ? args.consumoBaru
      : null

  if (baru == null) {
    return {
      outrosDescontos: residual,
      consumoBaru: null,
      baruAlreadyInNet: false,
    }
  }

  if (
    args.residualAlreadyInNet &&
    residual != null &&
    Math.abs(residual - baru) <= 2
  ) {
    return {
      outrosDescontos: null,
      consumoBaru: roundFolha(baru, 4),
      baruAlreadyInNet: true,
    }
  }

  if (
    args.residualAlreadyInNet &&
    residual != null &&
    baru + 0.02 < residual
  ) {
    const leftover = roundFolha(residual - baru, 4)
    return {
      outrosDescontos:
        leftover != null && leftover > 0.02 ? leftover : null,
      consumoBaru: roundFolha(baru, 4),
      baruAlreadyInNet: true,
    }
  }

  // Baru além do residual (ou sem residual) — abate no pay (Alison).
  return {
    outrosDescontos: residual,
    consumoBaru: roundFolha(baru, 4),
    baruAlreadyInNet: false,
  }
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
  /**
   * Alíquota W do profissional sobre U (BR 3% / IG 4%). Usada só para tolerar
   * shortfall em `descontos` ≈ (adm − meio) − W.
   */
  serviceTaxRate?: number | null
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
            embeddedShortfall: null,
            embeddedCreditResidual: null,
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
          embeddedShortfall: null,
          embeddedCreditResidual: null,
          taxaAdm: expectedAdm,
          meioAMeio,
          outrosResiduais: null,
          descontos8123Signed: signedOther,
        }
      }
    }

    // B) descontos 0/ausente — adm = charged × 3% (Lucas Q2).
    // Só quando há desconto de assistente (fluxo assistente-como-pro com meio).
    // Sem meio, `charged` é faturado de comissão própria — NÃO abater 3%
    // (Amanda/Edijane etc.: liquido Avec já fechado; 3%×faturado era falso).
    // Não aplicar se `descontos` tem outro valor material.
    const otherIsAbsentOrZero =
      signedOther == null || Math.abs(signedOther) <= 0.02
    if (
      otherIsAbsentOrZero &&
      meioAMeio != null &&
      meioAMeio > 0.02 &&
      expectedAdm != null &&
      expectedAdm > 0.02
    ) {
      return {
        embeddedAdminMeio: false,
        meioCreditedInNet: false,
        embeddedShortfall: null,
        embeddedCreditResidual: null,
        taxaAdm: expectedAdm,
        meioAMeio,
        outrosResiduais: null,
        descontos8123Signed: signedOther,
      }
    }
  }

  // --- Caminho profissional: descontos (mag) ≈ (adm − meio) ± residual/W ---
  let taxaAdm: number | null = null
  if (from8123Adm != null) {
    taxaAdm = roundFolha(from8123Adm, 4)
  } else if (args.adminRate != null && args.charged != null) {
    taxaAdm = roundFolha(args.charged * args.adminRate, 4)
  }

  const otherMag = signedOther == null ? null : Math.abs(signedOther)
  const admMinusMeio =
    taxaAdm != null && meioAMeio != null ? taxaAdm - meioAMeio : null
  const meioMinusAdm =
    taxaAdm != null && meioAMeio != null ? meioAMeio - taxaAdm : null

  // Pro sem assistente: descontos ≈ taxa adm (cheia) → a_pagar já fechou adm
  // (Rafaella / Célia Q2). Não reabater no proposed_pay.
  if (
    meioAMeio == null &&
    taxaAdm != null &&
    taxaAdm > 0.02 &&
    otherMag != null &&
    otherMag + 0.05 >= taxaAdm * 0.95
  ) {
    const residual = roundFolha(otherMag - taxaAdm, 4)
    return {
      embeddedAdminMeio: true,
      meioCreditedInNet: true,
      embeddedShortfall: null,
      embeddedCreditResidual: null,
      taxaAdm,
      meioAMeio: null,
      outrosResiduais:
        residual != null && residual > 0.02 ? residual : null,
      descontos8123Signed: signedOther,
    }
  }

  // Crédito: meio > adm e descontos > 0.
  // A) ≈ (meio − adm) + residual → Brunna/Gildenice (estornar residual).
  // B) ≈ (meio − adm) − Baru → Joanides (crédito menor; Baru já no a_pagar).
  if (
    meioMinusAdm != null &&
    meioMinusAdm > 0.005 &&
    signedOther != null &&
    signedOther > 0.02
  ) {
    const residualCredit = roundFolha(signedOther - meioMinusAdm, 4)
    if (signedOther + 0.05 >= meioMinusAdm * 0.85) {
      return {
        embeddedAdminMeio: true,
        meioCreditedInNet: true,
        embeddedShortfall: null,
        embeddedCreditResidual:
          residualCredit != null && residualCredit > 0.02 ? residualCredit : null,
        taxaAdm,
        meioAMeio,
        outrosResiduais:
          residualCredit != null && residualCredit > 0.02 ? residualCredit : null,
        descontos8123Signed: signedOther,
      }
    }
    // B) crédito parcial: shortfall ≈ CONSUMO BARU embutido no net
    const creditShortfall = roundFolha(meioMinusAdm - signedOther, 4)
    const maxBaruShort =
      args.charged != null
        ? Math.max(args.charged * 0.03, 500)
        : 500
    if (
      creditShortfall != null &&
      creditShortfall > 0.02 &&
      creditShortfall <= maxBaruShort
    ) {
      return {
        embeddedAdminMeio: true,
        meioCreditedInNet: true,
        embeddedShortfall: null,
        embeddedCreditResidual: null,
        taxaAdm,
        meioAMeio,
        outrosResiduais: creditShortfall,
        descontos8123Signed: signedOther,
      }
    }
  }

  // Crédito órfão (sem meio/adm): Romeu Q2 descontos=+1444 já no a_pagar → estornar.
  if (
    signedOther != null &&
    signedOther > 0.02 &&
    (meioAMeio == null || meioAMeio <= 0.02) &&
    (taxaAdm == null || taxaAdm <= 0.02)
  ) {
    return {
      embeddedAdminMeio: false,
      meioCreditedInNet: false,
      embeddedShortfall: null,
      embeddedCreditResidual: roundFolha(signedOther, 4),
      taxaAdm: taxaAdm != null && taxaAdm > 0.02 ? taxaAdm : null,
      meioAMeio: null,
      outrosResiduais: roundFolha(signedOther, 4),
      descontos8123Signed: signedOther,
    }
  }

  const shortfall =
    otherMag != null && admMinusMeio != null
      ? roundFolha(admMinusMeio - otherMag, 4)
      : null
  /** Teto do shortfall ≈ W máx. se U fosse o faturado inteiro. */
  const maxShortfall =
    args.charged != null && args.serviceTaxRate != null
      ? args.charged * args.serviceTaxRate + 1
      : null
  const coversAdmMeio =
    otherMag != null &&
    admMinusMeio != null &&
    admMinusMeio > 0.005 &&
    otherMag + 0.05 >= admMinusMeio
  const shortByW =
    shortfall != null &&
    shortfall > 0.02 &&
    maxShortfall != null &&
    shortfall <= maxShortfall &&
    otherMag != null &&
    admMinusMeio != null &&
    otherMag + 0.05 >= admMinusMeio * 0.85

  const embeddedAdminMeio = Boolean(coversAdmMeio || shortByW)
  const embeddedShortfall =
    embeddedAdminMeio && shortfall != null && shortfall > 0.02 ? shortfall : null

  let outrosResiduais: number | null = null
  if (otherMag != null) {
    if (embeddedAdminMeio && admMinusMeio != null) {
      const residual = roundFolha(otherMag - admMinusMeio, 4)
      // Residual positivo = BARU etc.; shortfall negativo não vira “outros”.
      outrosResiduais = residual != null && residual > 0.02 ? residual : null
    } else if (!embeddedAdminMeio && otherMag > 0.02) {
      outrosResiduais = otherMag
    }
  }

  return {
    embeddedAdminMeio,
    meioCreditedInNet: embeddedAdminMeio,
    embeddedShortfall,
    embeddedCreditResidual: null,
    taxaAdm,
    meioAMeio,
    outrosResiduais,
    descontos8123Signed: signedOther,
  }
}
