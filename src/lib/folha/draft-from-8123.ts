/**
 * Rascunho da Folha a partir do snapshot 8123 (salon_commissions_daily).
 *
 * O 8123 é espelho do fechamento Avec — não recalculamos % de comissão.
 * `proposed_pay` começa em `a_pagar` (net_payable) e abate/acresce camadas Folha:
 * DARF/DAS/mensalidade (Q1), U/V/W, meio a meio, taxa adm motor (quando 8123
 * veio zerado — ex.: IG 7% sobre faturado bruto).
 */

import type { RomPanelId } from '@/lib/brand'
import { calculateFolhaLine, roundFolha } from '@/lib/folha/calc'
import {
  resolveAssistantAdminTaxRate,
  resolveEsteticistaBonusRate,
  resolveFolhaPersonRules,
  resolveGrossAdminFeeRate,
  resolveMeioAMeioRate,
  resolveProfessionalServiceTaxRate,
  romeuAssistantMetaTopUp,
  type FolhaPersonRules,
} from '@/lib/folha/exceptions'
import {
  disaggregateOleriteDescontos,
  rateioAposCartao,
  resolveBaruVsOleriteResidual,
} from '@/lib/folha/olerite-disaggregate'
import { quinzenaForDay, todayIsoSaoPaulo, type FolhaQuinzena } from '@/lib/folha/period'
import { normalizeFolhaCargo, type FolhaCargo } from '@/lib/folha/rules'
import {
  getLatestSalonCommissionsDaily,
  getSalonCommissionsDailyNear,
  type CommissionProfessionalRow,
} from '@/lib/salon/commission-metrics'

/** Magnitude de abatimento Avec (8123 guarda negativos). Ausente → null. */
export function deductionMagnitude(value: number | null | undefined): number | null {
  if (value == null || Number.isNaN(value)) return null
  return Math.abs(value)
}

export type FolhaDraftFlag =
  | 'manicure_com_taxa_adm'
  | 'sem_a_pagar'
  | 'sem_cargo'
  | 'assistente_com_desconto'
  | 'excecao_nomeada'
  | 'meta_quinzena_pendente'
  | 'meta_romeu_pendente'
  | 'assistente_romeu'
  | 'taxa_adm_motor'
  /** Taxa adm (e meio) já no 8123 `descontos` — só conferência na coluna. */
  | 'taxa_adm_em_descontos'

export type FolhaDraftLine = {
  name: string
  cargo_raw: string | null
  cargo: FolhaCargo
  /** Espelho 8123 — ausente = null. */
  avec: {
    charged: number | null
    service_share: number | null
    product_share: number | null
    house_share: number | null
    card_fee: number | null
    admin_fee: number | null
    assistant_discount: number | null
    product_spend: number | null
    other_discounts: number | null
    tip: number | null
    net_payable: number | null
  }
  /** Meio a meio (crédito) — entra no proposed_pay. */
  meio_a_meio: number | null
  /** Taxa efetiva de meio a meio (0.05 Pedro/Dayana; 0.70 Walter; 0.5 default). */
  meio_a_meio_rate: number
  /**
   * Taxa adm efetiva para a tabela (8123 se > 0; senão motor × faturado).
   * KPI ausente = null (não vira 0 falso na UI — usamos "—" ).
   */
  taxa_administrativa: number | null
  /** Alíquota usada (0.07 IG / 0.05 Brunna trio ou BR). */
  taxa_administrativa_rate: number | null
  /** Origem do valor exibido/abatido. */
  taxa_administrativa_source: '8123' | 'motor' | null
  /**
   * Residual olerite após desmembrar (adm − meio) de `descontos` 8123
   * (ex.: CONSUMO BARU). null se não há residual.
   */
  outros_descontos: number | null
  /**
   * Rateio após cartão — espelha “Total Rateio” do recibo Avec
   * (service_share − |taxa_cartao|).
   */
  rateio_apos_cartao: number | null
  /** Id da exceção nomeada, se houver. */
  exception_id: string | null
  /** Camadas Folha ainda não no 8123 — null até IMAP/RH/U. */
  folha_extras: {
    parc: number | null
    darf: number | null
    das: number | null
    div_ativa: number | null
    mensalidade_contabilidade: number | null
    descontos_diversos: number | null
    /**
     * Consumo Baru (RH) — abate no líquido. Separado de descontos_diversos
     * para a planilha ter coluna própria por profissional/unidade.
     */
    consumo_baru: number | null
    produtos_black: number | null
    servicos_assistente_como_pro: number | null
    valor_a_pagar_profissional: number | null
    taxa_servicos: number | null
    /** Taxa adm do assistente (IG 3% / Brunna 2%) sobre U — conferência. */
    taxa_adm_assistente: number | null
    /**
     * Taxa adm profissional calculada pelo motor (quando 8123 veio 0/null).
     * Abate no proposed_pay; não duplica se source=8123.
     */
    taxa_administrativa: number | null
    esteticista_bonus: number | null
    /**
     * Acumulado mês = soma U Romeu Q1+Q2 (Serviços 30%), não faturado bruto.
     * Define faixa 30/40/50. KPI ausente = null (não inventa 0).
     */
    acumulado_mes: number | null
    /**
     * Top-up de meta Romeu (adic. além dos 30% já pagos nas quinzenas).
     * Só creditado no Q2 (dia 05); null no Q1 ou se acumulado ausente/&lt;1000.
     * 0 é valor real quando mês ficou na faixa 30%.
     */
    romeu_comissao_parcela: number | null
  }
  /**
   * a_pagar 8123 ± extras Folha.
   * null se 8123 não trouxe a_pagar (não inventa 0).
   */
  proposed_pay: number | null
  /**
   * Preview da fórmula Y quando dá para remontar fat. líquido a partir do 8123.
   * Só conferência — proposed_pay manda no pagamento.
   */
  formula_y_preview: number | null
  flags: FolhaDraftFlag[]
}

export type FolhaDraft = {
  source: '8123'
  reference_day: string
  quinzena: FolhaQuinzena
  panel: RomPanelId
  line_count: number
  lines: FolhaDraftLine[]
  /** Soma dos proposed_pay presentes; null se nenhum. */
  total_proposed_pay: number | null
}

function n(v: number | null | undefined): number {
  return v == null || Number.isNaN(v) ? 0 : v
}

/**
 * BR (e às vezes IG): 8123 zera `taxa_adm` e `descontos`, mas `a_pagar` já
 * neteia rateio − produto − assistente + meio − adm. Sem esse cheque o motor
 * reacreditava meio e reabatia adm (Alison BR Q2).
 */
export function aPagarAlreadyNetsAdminMeio(args: {
  netPayable: number | null | undefined
  rateioAposCartao: number | null
  productSpend: number | null | undefined
  assistantDiscount: number | null | undefined
  meioAMeio: number | null
  taxaAdm: number | null
  /** Tolerância em R$ (ruído de centavos Avec). */
  tol?: number
}): boolean {
  if (
    args.netPayable == null ||
    args.rateioAposCartao == null ||
    args.taxaAdm == null ||
    args.taxaAdm <= 0.02
  ) {
    return false
  }
  const expected = roundFolha(
    args.rateioAposCartao -
      n(deductionMagnitude(args.productSpend)) -
      n(deductionMagnitude(args.assistantDiscount)) +
      n(args.meioAMeio) -
      args.taxaAdm,
    4,
  )
  if (expected == null) return false
  return Math.abs(args.netPayable - expected) <= (args.tol ?? 1)
}

/**
 * Remonta um fat. líquido aproximado para preview Y:
 * a_pagar + magnitudes dos abatimentos 8123 (produto, adm, assistente, outros, cartão).
 * Não usa meio a meio aqui — o calc reaplica M = L/2.
 */
export function reconstructFatLiquidoFrom8123(
  row: CommissionProfessionalRow,
): number | null {
  if (row.net_payable == null) return null
  return (
    row.net_payable +
    n(deductionMagnitude(row.product_spend)) +
    n(deductionMagnitude(row.admin_fee)) +
    n(deductionMagnitude(row.assistant_discount)) +
    n(deductionMagnitude(row.other_discounts)) +
    n(deductionMagnitude(row.card_fee))
  )
}

/** Campos fiscais que só entram no pagamento do dia 20 (Q1). */
export function stripFolhaTaxExtras(
  extras: FolhaDraftLine['folha_extras'],
): FolhaDraftLine['folha_extras'] {
  return {
    ...extras,
    darf: null,
    das: null,
    mensalidade_contabilidade: null,
  }
}

function applyFolhaExtras(
  netPayable: number | null,
  extras: FolhaDraftLine['folha_extras'],
  meioAMeio: number | null,
): number | null {
  if (netPayable == null) return null
  return (
    netPayable -
    n(extras.parc) -
    n(extras.darf) -
    n(extras.das) -
    n(extras.div_ativa) -
    n(extras.mensalidade_contabilidade) -
    n(extras.descontos_diversos) -
    n(extras.consumo_baru) -
    n(extras.produtos_black) -
    n(extras.taxa_administrativa) +
    n(meioAMeio) +
    n(extras.valor_a_pagar_profissional) -
    n(extras.taxa_servicos) +
    n(extras.esteticista_bonus) +
    n(extras.romeu_comissao_parcela)
  )
}

/**
 * Avec frequentemente embute no 8123 `descontos` o líquido
 * (TAXA ADM − MEIO A MEIO) + outros (ex.: CONSUMO BARU), com `taxa_adm` = 0.
 * Delegado a `disaggregateOleriteDescontos` (fonte única).
 */
export function avecDescontosAlreadyNetsAdminMeio(args: {
  otherDiscounts: number | null | undefined
  charged: number | null
  assistantDiscount: number | null | undefined
  adminRate: number | null
  meioRate: number
}): boolean {
  return disaggregateOleriteDescontos({
    charged: args.charged,
    adminFee8123: null,
    assistantDiscount: args.assistantDiscount,
    otherDiscounts: args.otherDiscounts,
    adminRate: args.adminRate,
    meioRate: args.meioRate,
  }).embeddedAdminMeio
}

/**
 * Resolve taxa adm para exibição e abatimento.
 * 8123 com valor > 0 manda; senão motor calcula alíquota × faturado (exibição).
 * Abate no proposed_pay só se `descontos` NÃO parecer já embutir adm−meio.
 */
export function resolveLineAdminFee(args: {
  panel: RomPanelId
  cargo: FolhaCargo
  charged: number | null
  adminFee8123: number | null | undefined
  person: FolhaPersonRules | null
  /** Quando true, só exibe a taxa — a_pagar Avec já fechou adm/meio. */
  embeddedInDescontos?: boolean
}): {
  amount: number | null
  rate: number | null
  source: '8123' | 'motor' | null
  /** Só preenchido quando o motor precisa abater (8123 zerado e não embutido). */
  motorExtra: number | null
} {
  const from8123 = deductionMagnitude(args.adminFee8123)
  if (from8123 != null && from8123 > 0) {
    const rate = resolveGrossAdminFeeRate(args.panel, args.cargo, args.person)
    return { amount: from8123, rate, source: '8123', motorExtra: null }
  }
  const rate = resolveGrossAdminFeeRate(args.panel, args.cargo, args.person)
  if (rate == null || args.charged == null) {
    return { amount: null, rate, source: null, motorExtra: null }
  }
  const amount = roundFolha(args.charged * rate, 4)
  return {
    amount,
    rate,
    source: 'motor',
    motorExtra: args.embeddedInDescontos ? null : amount,
  }
}

export function buildFolhaDraftLine(
  panel: RomPanelId,
  row: CommissionProfessionalRow,
  extras?: Partial<FolhaDraftLine['folha_extras']>,
  opts?: { applyTaxExtras?: boolean },
): FolhaDraftLine {
  const applyTaxExtras = opts?.applyTaxExtras !== false
  const cargo = normalizeFolhaCargo(row.role)
  const person = resolveFolhaPersonRules(row.name)
  const meioRate = resolveMeioAMeioRate(person)
  const assistantMag = deductionMagnitude(row.assistant_discount)
  const meio_a_meio =
    assistantMag == null ? null : roundFolha(assistantMag * meioRate, 4)

  const adminRatePreview = resolveGrossAdminFeeRate(panel, cargo, person)
  const assistantAdminRate =
    cargo === 'assistente' || cargo === 'multiplicador' || cargo === 'colorista'
      ? resolveAssistantAdminTaxRate(panel, person)
      : null
  const serviceTaxRate = resolveProfessionalServiceTaxRate(panel, person)
  const olerite = disaggregateOleriteDescontos({
    charged: row.charged,
    adminFee8123: row.admin_fee,
    assistantDiscount: row.assistant_discount,
    otherDiscounts: row.other_discounts,
    adminRate: adminRatePreview,
    meioRate,
    assistantAdminRate,
    serviceTaxRate,
  })
  const rateio_apos_cartao = rateioAposCartao({
    charged: row.charged,
    serviceShare: row.service_share,
    cardFee: row.card_fee,
  })
  const taxaAdmPreview =
    olerite.taxaAdm ??
    (adminRatePreview != null && row.charged != null
      ? roundFolha(row.charged * adminRatePreview, 4)
      : null)
  const aPagarNetsAdminMeio = aPagarAlreadyNetsAdminMeio({
    netPayable: row.net_payable,
    rateioAposCartao: rateio_apos_cartao,
    productSpend: row.product_spend,
    assistantDiscount: row.assistant_discount,
    meioAMeio: meio_a_meio,
    taxaAdm: taxaAdmPreview,
  })
  const embeddedInDescontos = olerite.embeddedAdminMeio || aPagarNetsAdminMeio
  const meioCreditedInNet = olerite.meioCreditedInNet || aPagarNetsAdminMeio

  const admin = resolveLineAdminFee({
    panel,
    cargo,
    charged: row.charged,
    adminFee8123: row.admin_fee,
    person,
    embeddedInDescontos,
  })
  /**
   * Meio no proposed_pay só se a_pagar ainda não creditou
   * (nem via descontos ≈ meio−adm, nem via descontos ≈ +meio,
   * nem via a_pagar já fechado com adm/meio e descontos=0).
   */
  const meioForProposedPay =
    embeddedInDescontos || meioCreditedInNet ? null : meio_a_meio
  /** Exibição: adm do 8123/motor, ou adm 3% (desmembrada ou charged×3%). */
  const taxaAdmDisplay = admin.amount ?? olerite.taxaAdm
  /**
   * Abate no proposed_pay: motor BR 5%/IG 7% (pro) ou adm 3% assistente quando
   * a_pagar ainda não fechou a taxa (Lucas: descontos=0).
   * null explícito em extras antigos NÃO sobrescreve o motor.
   */
  const assistantAdmMotorExtra =
    !embeddedInDescontos &&
    admin.motorExtra == null &&
    assistantAdminRate != null &&
    olerite.taxaAdm != null
      ? olerite.taxaAdm
      : null
  const taxaAdmMotorExtra = admin.motorExtra ?? assistantAdmMotorExtra
  const rhTaxaAdm =
    typeof extras?.taxa_administrativa === 'number'
      ? extras.taxa_administrativa
      : null

  const isAssistantLike =
    cargo === 'assistente' || cargo === 'multiplicador' || cargo === 'colorista'

  /**
   * Romeu: acumulado mês → top-up de meta só no Q2 (applyTaxExtras false / dia 05).
   * Q1: null — os 30% base já estão no Avec / Serviços 30%.
   */
  const romeuMeta =
    person?.isRomeuAssistant && extras?.acumulado_mes != null
      ? romeuAssistantMetaTopUp(extras.acumulado_mes)
      : null
  const romeuParcela =
    !applyTaxExtras && romeuMeta?.topUp != null
      ? roundFolha(romeuMeta.topUp, 4)
      : null

  let folha_extras: FolhaDraftLine['folha_extras'] = {
    parc: extras?.parc ?? null,
    darf: extras?.darf ?? null,
    das: extras?.das ?? null,
    div_ativa: extras?.div_ativa ?? null,
    mensalidade_contabilidade: extras?.mensalidade_contabilidade ?? null,
    descontos_diversos: extras?.descontos_diversos ?? null,
    consumo_baru: extras?.consumo_baru ?? null,
    produtos_black: extras?.produtos_black ?? null,
    servicos_assistente_como_pro: extras?.servicos_assistente_como_pro ?? null,
    valor_a_pagar_profissional: extras?.valor_a_pagar_profissional ?? null,
    taxa_servicos: extras?.taxa_servicos ?? null,
    taxa_adm_assistente: extras?.taxa_adm_assistente ?? null,
    taxa_administrativa: rhTaxaAdm ?? taxaAdmMotorExtra,
    // Liria suprime o bônus mesmo se o rascunho antigo já gravou os 10%.
    esteticista_bonus: person?.suppressEsteticistaBonus
      ? null
      : (extras?.esteticista_bonus ?? null),
    acumulado_mes: extras?.acumulado_mes ?? null,
    romeu_comissao_parcela: romeuParcela,
  }
  if (!applyTaxExtras) {
    folha_extras = stripFolhaTaxExtras(folha_extras)
  }

  // Esteticista: bônus 10% do faturado (caderno) — só se charged presente,
  // extras não override e pessoa não suprime (Liria).
  if (
    resolveEsteticistaBonusRate(cargo, person) != null &&
    folha_extras.esteticista_bonus == null &&
    row.charged != null
  ) {
    const preview = calculateFolhaLine({
      panel,
      professionalName: row.name,
      cargo: row.role,
      faturado: row.charged,
      pctSalao: null,
      fatLiquido: reconstructFatLiquidoFrom8123(row),
      taxaCartaoPix: deductionMagnitude(row.card_fee),
      produto: deductionMagnitude(row.product_spend),
      taxaAdministrativa: admin.amount,
      descontoAssistente: assistantMag,
      meioAMeio: meio_a_meio,
      parc: null,
      darf: null,
      das: null,
      divAtiva: null,
      mensalidadeContabilidade: null,
      descontosDiversos: deductionMagnitude(row.other_discounts),
      produtosBlack: null,
      servicosAssistenteComoPro: folha_extras.servicos_assistente_como_pro,
      valorAPagarProfissional: folha_extras.valor_a_pagar_profissional,
      remitRateOverride: null,
      taxaServicosOverride: folha_extras.taxa_servicos,
      hasDepilacao: false,
      waiveAdminFee: false,
    })
    folha_extras.esteticista_bonus = preview.esteticistaBonus
  }

  // Se U informado, deriva V/W (+ taxa adm assistente) via motor / exceções.
  if (folha_extras.servicos_assistente_como_pro != null) {
    const u = folha_extras.servicos_assistente_como_pro
    const derived = calculateFolhaLine({
      panel,
      professionalName: row.name,
      cargo: row.role,
      faturado: row.charged,
      pctSalao: null,
      fatLiquido: reconstructFatLiquidoFrom8123(row),
      taxaCartaoPix: deductionMagnitude(row.card_fee),
      produto: deductionMagnitude(row.product_spend),
      taxaAdministrativa: admin.amount,
      descontoAssistente: assistantMag,
      meioAMeio: meio_a_meio,
      parc: folha_extras.parc,
      darf: folha_extras.darf,
      das: folha_extras.das,
      divAtiva: folha_extras.div_ativa,
      mensalidadeContabilidade: folha_extras.mensalidade_contabilidade,
      descontosDiversos: folha_extras.descontos_diversos,
      consumoBaru: folha_extras.consumo_baru,
      produtosBlack: folha_extras.produtos_black,
      servicosAssistenteComoPro: u,
      valorAPagarProfissional: folha_extras.valor_a_pagar_profissional,
      remitRateOverride: null,
      taxaServicosOverride: folha_extras.taxa_servicos,
      hasDepilacao: false,
      waiveAdminFee: false,
    })
    if (folha_extras.valor_a_pagar_profissional == null) {
      folha_extras.valor_a_pagar_profissional = derived.valorAPagarProfissional
    }
    if (folha_extras.taxa_servicos == null) {
      folha_extras.taxa_servicos = derived.taxaServicos
    }
    if (folha_extras.taxa_adm_assistente == null) {
      const assistTax = resolveAssistantAdminTaxRate(panel, person)
      folha_extras.taxa_adm_assistente =
        assistTax == null ? null : roundFolha(u * assistTax, 4)
    }
  }

  /**
   * 8123 às vezes embute W reduzindo `descontos` (Daniel: shortfall ≈ W).
   * a_pagar fica alto demais em W; ao abater taxa_servicos no pay, compensar.
   * Coluna W (taxa_servicos) permanece o valor verdadeiro U×alíquota.
   *
   * Crédito residual (Brunna): descontos ≈ (meio − adm) + residual — a_pagar
   * já somou o residual; estornar via descontos_diversos no pay.
   *
   * Assistente/multiplicador: U/V/W na Fopag são conferência / repasse ao
   * profissional — não entram no líquido do assistente (só no pro).
   */
  let extrasForProposedPay: FolhaDraftLine['folha_extras'] = isAssistantLike
    ? {
        ...folha_extras,
        valor_a_pagar_profissional: null,
        taxa_servicos: null,
      }
    : { ...folha_extras }

  if (
    extrasForProposedPay.taxa_servicos != null &&
    olerite.embeddedShortfall != null &&
    olerite.embeddedShortfall > 0.02
  ) {
    extrasForProposedPay = {
      ...extrasForProposedPay,
      taxa_servicos: roundFolha(
        extrasForProposedPay.taxa_servicos + olerite.embeddedShortfall,
        4,
      ),
    }
  }

  if (
    olerite.embeddedCreditResidual != null &&
    olerite.embeddedCreditResidual > 0.02
  ) {
    extrasForProposedPay = {
      ...extrasForProposedPay,
      descontos_diversos: roundFolha(
        (extrasForProposedPay.descontos_diversos ?? 0) +
          olerite.embeddedCreditResidual,
        4,
      ),
    }
  }

  /**
   * Baru vs residual olerite (Fopag: colunas separadas).
   * Débito residual ≈ Baru embutido no a_pagar → coluna Baru, Outros null,
   * sem reabater. Crédito residual (Brunna) NÃO é Baru — fica em Outros e
   * já é estornado via descontos_diversos; Baru do RH ainda abate.
   */
  const debitResidualForBaru =
    olerite.embeddedCreditResidual != null ? null : olerite.outrosResiduais
  const baruSplit = resolveBaruVsOleriteResidual({
    outrosResiduais: debitResidualForBaru,
    consumoBaru: folha_extras.consumo_baru,
    residualAlreadyInNet:
      embeddedInDescontos && olerite.embeddedCreditResidual == null,
  })
  folha_extras = {
    ...folha_extras,
    consumo_baru: baruSplit.consumoBaru,
  }
  if (baruSplit.baruAlreadyInNet) {
    extrasForProposedPay = {
      ...extrasForProposedPay,
      consumo_baru: null,
    }
  } else {
    extrasForProposedPay = {
      ...extrasForProposedPay,
      consumo_baru: baruSplit.consumoBaru,
    }
  }
  const outrosDescontosDisplay =
    olerite.embeddedCreditResidual != null
      ? olerite.outrosResiduais
      : baruSplit.outrosDescontos

  const flags: FolhaDraftFlag[] = []
  if (cargo === 'manicure' && admin.amount != null && admin.amount > 0) {
    flags.push('manicure_com_taxa_adm')
  }
  if (row.net_payable == null) flags.push('sem_a_pagar')
  if (!row.role?.trim()) flags.push('sem_cargo')
  if (assistantMag != null && assistantMag > 0) flags.push('assistente_com_desconto')
  if (person) flags.push('excecao_nomeada')
  if (person?.hasQuinzenaMeta && person.quinzenaMeta == null) {
    flags.push('meta_quinzena_pendente')
  }
  if (person?.isRomeuAssistant) flags.push('assistente_romeu')
  if (person?.isRomeuAssistant && folha_extras.acumulado_mes == null) {
    flags.push('meta_romeu_pendente')
  }
  if (
    (admin.source === 'motor' && admin.motorExtra != null) ||
    assistantAdmMotorExtra != null
  ) {
    flags.push('taxa_adm_motor')
  }
  if (embeddedInDescontos && taxaAdmDisplay != null) {
    flags.push('taxa_adm_em_descontos')
  }

  const fatLiquido = reconstructFatLiquidoFrom8123(row)
  const yPreview =
    fatLiquido == null
      ? null
      : calculateFolhaLine({
          panel,
          professionalName: row.name,
          cargo: row.role,
          faturado: row.charged,
          pctSalao: null,
          fatLiquido,
          taxaCartaoPix: deductionMagnitude(row.card_fee),
          produto: deductionMagnitude(row.product_spend),
          taxaAdministrativa: admin.amount,
          descontoAssistente: assistantMag,
          meioAMeio: meio_a_meio,
          parc: folha_extras.parc,
          darf: folha_extras.darf,
          das: folha_extras.das,
          divAtiva: folha_extras.div_ativa,
          mensalidadeContabilidade: folha_extras.mensalidade_contabilidade,
          descontosDiversos: folha_extras.descontos_diversos,
          consumoBaru: folha_extras.consumo_baru,
          produtosBlack: folha_extras.produtos_black,
          servicosAssistenteComoPro: folha_extras.servicos_assistente_como_pro,
          valorAPagarProfissional: folha_extras.valor_a_pagar_profissional,
          remitRateOverride: null,
          taxaServicosOverride: folha_extras.taxa_servicos,
          hasDepilacao: false,
          waiveAdminFee: cargo === 'manicure',
        }).valorLiquido

  return {
    name: row.name,
    cargo_raw: row.role,
    cargo,
    avec: {
      charged: row.charged,
      service_share: row.service_share,
      product_share: row.product_share,
      house_share: row.house_share,
      card_fee: row.card_fee,
      admin_fee: row.admin_fee,
      assistant_discount: row.assistant_discount,
      product_spend: row.product_spend,
      other_discounts: row.other_discounts,
      tip: row.tip,
      net_payable: row.net_payable,
    },
    meio_a_meio,
    meio_a_meio_rate: meioRate,
    taxa_administrativa: taxaAdmDisplay,
    taxa_administrativa_rate:
      admin.rate ??
      (taxaAdmDisplay != null && assistantAdminRate != null ? assistantAdminRate : null),
    taxa_administrativa_source:
      admin.source ??
      (taxaAdmDisplay != null && assistantAdminRate != null ? 'motor' : null),
    outros_descontos: outrosDescontosDisplay,
    rateio_apos_cartao,
    exception_id: person?.id ?? null,
    folha_extras,
    proposed_pay: roundFolha(
      applyFolhaExtras(row.net_payable, extrasForProposedPay, meioForProposedPay),
      4,
    ),
    formula_y_preview: roundFolha(yPreview, 4),
    flags,
  }
}

export function buildFolhaDraftFrom8123(args: {
  panel: RomPanelId
  referenceDay: string
  professionals: readonly CommissionProfessionalRow[]
  /** Âncora da quinzena; default = referenceDay. */
  quinzenaDay?: string
}): FolhaDraft {
  const quinzena = quinzenaForDay(args.quinzenaDay ?? args.referenceDay)
  const applyTaxExtras = quinzena.half === 1
  const lines = args.professionals
    .filter((p) => Boolean(p.name?.trim()))
    .map((p) => buildFolhaDraftLine(args.panel, p, undefined, { applyTaxExtras }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))

  let total: number | null = null
  for (const line of lines) {
    if (line.proposed_pay == null) continue
    total = (total ?? 0) + line.proposed_pay
  }

  return {
    source: '8123',
    reference_day: args.referenceDay,
    quinzena,
    panel: args.panel,
    line_count: lines.length,
    lines,
    total_proposed_pay: roundFolha(total, 2),
  }
}

/** Carrega rascunho a partir do snapshot 8123 mais recente (ou null se vazio). */
export async function loadFolhaDraftFromLatest8123(
  panel: RomPanelId,
  opts?: { referenceDay?: string },
): Promise<FolhaDraft | null> {
  const anchor = opts?.referenceDay ?? todayIsoSaoPaulo()
  const snapshot =
    (await getSalonCommissionsDailyNear(anchor, { maxSkewDays: 45 })) ??
    (await getLatestSalonCommissionsDaily())

  if (!snapshot || snapshot.professionals.length === 0) return null

  return buildFolhaDraftFrom8123({
    panel,
    referenceDay: snapshot.day,
    professionals: snapshot.professionals,
    quinzenaDay: anchor,
  })
}
