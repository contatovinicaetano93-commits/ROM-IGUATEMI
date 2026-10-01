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
  resolveFolhaPersonRules,
  resolveGrossAdminFeeRate,
  resolveMeioAMeioRate,
  type FolhaPersonRules,
} from '@/lib/folha/exceptions'
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
  | 'assistente_romeu'
  | 'taxa_adm_motor'

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
    n(extras.produtos_black) -
    n(extras.taxa_administrativa) +
    n(meioAMeio) +
    n(extras.valor_a_pagar_profissional) -
    n(extras.taxa_servicos) +
    n(extras.esteticista_bonus)
  )
}

/**
 * Resolve taxa adm para exibição e abatimento.
 * 8123 com valor > 0 manda; senão motor aplica alíquota × faturado bruto.
 */
export function resolveLineAdminFee(args: {
  panel: RomPanelId
  cargo: FolhaCargo
  charged: number | null
  adminFee8123: number | null | undefined
  person: FolhaPersonRules | null
}): {
  amount: number | null
  rate: number | null
  source: '8123' | 'motor' | null
  /** Só preenchido quando o motor precisa abater (8123 zerado). */
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
  return { amount, rate, source: 'motor', motorExtra: amount }
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

  const admin = resolveLineAdminFee({
    panel,
    cargo,
    charged: row.charged,
    adminFee8123: row.admin_fee,
    person,
  })

  let folha_extras: FolhaDraftLine['folha_extras'] = {
    parc: extras?.parc ?? null,
    darf: extras?.darf ?? null,
    das: extras?.das ?? null,
    div_ativa: extras?.div_ativa ?? null,
    mensalidade_contabilidade: extras?.mensalidade_contabilidade ?? null,
    descontos_diversos: extras?.descontos_diversos ?? null,
    produtos_black: extras?.produtos_black ?? null,
    servicos_assistente_como_pro: extras?.servicos_assistente_como_pro ?? null,
    valor_a_pagar_profissional: extras?.valor_a_pagar_profissional ?? null,
    taxa_servicos: extras?.taxa_servicos ?? null,
    taxa_adm_assistente: extras?.taxa_adm_assistente ?? null,
    taxa_administrativa:
      extras?.taxa_administrativa !== undefined
        ? extras.taxa_administrativa
        : admin.motorExtra,
    esteticista_bonus: extras?.esteticista_bonus ?? null,
  }
  if (!applyTaxExtras) {
    folha_extras = stripFolhaTaxExtras(folha_extras)
  }

  // Esteticista: bônus 10% do faturado (caderno) — só se charged presente e extras não override.
  if (
    cargo === 'esteticista' &&
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
  if (admin.source === 'motor') flags.push('taxa_adm_motor')

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
    taxa_administrativa: admin.amount,
    taxa_administrativa_rate: admin.rate,
    taxa_administrativa_source: admin.source,
    exception_id: person?.id ?? null,
    folha_extras,
    proposed_pay: roundFolha(
      applyFolhaExtras(row.net_payable, folha_extras, meio_a_meio),
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
