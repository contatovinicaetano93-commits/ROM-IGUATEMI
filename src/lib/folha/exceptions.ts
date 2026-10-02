/**
 * Exceções nomeadas da Folha PJ — assistente / meio a meio / taxa U.
 *
 * Fontes: clarificações RH (chat 2026-10-01). KPI ausente = null.
 */

import { occupancyMergeKey } from '@/lib/director-report/match-pro'
import {
  ASSISTANT_AS_PRO_EARN_RATE,
  ASSISTANT_AS_PRO_REMIT_RATE,
  ESTETICISTA_BONUS_RATE,
  MEIO_A_MEIO_RATE,
  assistantServiceTaxRate,
  defaultAdminFeeRate,
  type FolhaCargo,
} from '@/lib/folha/rules'
import type { RomPanelId } from '@/lib/brand'

export type FolhaExceptionId =
  | 'pedro_diello'
  | 'dayana'
  | 'gildenice'
  | 'romeu'
  | 'walter_leal'
  | 'dani_rocha'
  | 'liria'
  | 'brunna'
  | 'joanides'
  | 'marcela'
  | 'gabriela_martins'
  | 'graciele'
  | 'camila_ornelas'
  | 'tatiana_moura'
  | 'patricia_aguiar'
  | 'lucas_campos'
  | 'romeu_assistant'
  | 'auricaliane'

export type FolhaServiceTaxSplit = {
  /** Soma das alíquotas (ex.: 0.05). */
  total: number
  /** Parcela do assistente (ex.: 0.02). */
  assistant: number
  /** Parcela do profissional (ex.: 0.03) — entra em W. */
  professional: number
}

export type FolhaPersonRules = {
  id: FolhaExceptionId
  /** Aliases normalizados via occupancyMergeKey. */
  aliases: string[]
  /**
   * Fração de `descontoAssistente` que volta ao profissional (meio a meio).
   * null = usar default ou derivar de `assistantRemitRate`.
   */
  meioAMeioRate: number | null
  /**
   * Fração fixa do base do assistente que vai ao assistente
   * (Walter 30% / Dani 35%). Quando setado, meio a meio = 1 − rate.
   */
  assistantRemitRate: number | null
  /** Comissão do profissional (Walter 60% / Dani 55%) — contrato. */
  proCommissionRate: number | null
  /** Rateio especial da taxa sobre U (Brunna / Joanides / Marcela). */
  serviceTaxSplit: FolhaServiceTaxSplit | null
  /**
   * Override da taxa adm sobre faturado bruto (coluna C).
   * Default: BR 5% / IG 7%. Brunna/Joanides/Marcela = 5% no IG. null = default do cargo.
   */
  adminFeeRate: number | null
  /**
   * Meta absoluta opcional (override). Lucas usa crescimento YoY — ver
   * {@link LUCAS_CAMPOS_META_YOY_GROWTH}; quinzenaMeta fica null.
   */
  quinzenaMeta: number | null
  /** Tem regra de meta na 2ª quinzena (Lucas Campos). */
  hasQuinzenaMeta: boolean
  /** Assistente do Romeu — faixas progressivas 30/40/50. */
  isRomeuAssistant: boolean
  /**
   * Sem bônus 10% de esteticista (Liria: usa sala de estética com taxa adm 7%,
   * sem bônus — perfil de manicure/depilação na sala).
   */
  suppressEsteticistaBonus: boolean
  /**
   * Multiplicador/assistente cujo líquido inclui ganho U×earn − W
   * (Base Folha BR: Auricaliane). Default: U/V/W só conferência no assistente.
   */
  assistantEarnInPay?: boolean
}

const BRUNNA_TAX_SPLIT: FolhaServiceTaxSplit = {
  total: 0.05,
  assistant: 0.02,
  professional: 0.03,
}

/**
 * Catálogo travado. Match por alias (chave occupancyMergeKey).
 * Pedro Cardi ≠ Pedro Diello — aliases distintos.
 */
export const FOLHA_NAMED_EXCEPTIONS: readonly FolhaPersonRules[] = [
  {
    // Salão sempre 5%; pro recebe de volta 5% do desc. assistente.
    // Se a comissão do assistente > 10%, o pro arca o excedente (Avec já desconta
    // o valor cheio); o salão não passa de 5%. Fopag às vezes formula meio=50% —
    // ignorar a coluna e usar esta alíquota.
    id: 'pedro_diello',
    aliases: ['pedro diello', 'pedro e f diello'],
    meioAMeioRate: 0.05,
    assistantRemitRate: null,
    proCommissionRate: null,
    serviceTaxSplit: null,
    adminFeeRate: null,
    quinzenaMeta: null,
    hasQuinzenaMeta: false,
    isRomeuAssistant: false,
    suppressEsteticistaBonus: false,
  },
  {
    // BR: meio a meio 5% (salão 5%; pro arca o restante se assistente > 10%).
    id: 'dayana',
    aliases: [
      'dayana marques silva pinto',
      'dayana marques',
      'dayana',
      'daiana marques',
      'daiana',
    ],
    meioAMeioRate: 0.05,
    assistantRemitRate: null,
    proCommissionRate: null,
    serviceTaxSplit: null,
    adminFeeRate: null,
    quinzenaMeta: null,
    hasQuinzenaMeta: false,
    isRomeuAssistant: false,
    suppressEsteticistaBonus: false,
  },
  {
    // IG: mesma lógica Diello/Dayana — meio 5% (Fopag coluna pode mostrar 50%).
    id: 'gildenice',
    aliases: [
      'gildenice teixeira de medeiros',
      'gildenice teixeira',
      'gildenice',
    ],
    meioAMeioRate: 0.05,
    assistantRemitRate: null,
    proCommissionRate: null,
    serviceTaxSplit: null,
    adminFeeRate: null,
    quinzenaMeta: null,
    hasQuinzenaMeta: false,
    isRomeuAssistant: false,
    suppressEsteticistaBonus: false,
  },
  {
    id: 'romeu',
    aliases: ['romeu felipe', 'romeu'],
    meioAMeioRate: 0.5,
    assistantRemitRate: null,
    proCommissionRate: null,
    serviceTaxSplit: null,
    adminFeeRate: null,
    quinzenaMeta: null,
    hasQuinzenaMeta: false,
    isRomeuAssistant: false,
    suppressEsteticistaBonus: false,
  },
  {
    id: 'walter_leal',
    aliases: [
      'walter martinho leal filho cabeleireiro',
      'walter martinho leal',
      'walter leal',
      'walter',
    ],
    meioAMeioRate: null,
    assistantRemitRate: 0.3,
    proCommissionRate: 0.6,
    serviceTaxSplit: null,
    adminFeeRate: null,
    quinzenaMeta: null,
    hasQuinzenaMeta: false,
    isRomeuAssistant: false,
    suppressEsteticistaBonus: false,
  },
  {
    // 55% = comissão do contrato (pct_salao / Avec). Meio a meio = 50% padrão.
    // NÃO confundir com Walter (assistente 30% → meio 70%).
    id: 'dani_rocha',
    aliases: ['daniela machado rocha', 'dani rocha', 'dani machado rocha'],
    meioAMeioRate: null,
    assistantRemitRate: null,
    proCommissionRate: 0.55,
    serviceTaxSplit: null,
    adminFeeRate: null,
    quinzenaMeta: null,
    hasQuinzenaMeta: false,
    isRomeuAssistant: false,
    suppressEsteticistaBonus: false,
  },
  {
    // Usa sala de estética: taxa adm 7% (perfil manicure/depilação).
    // RH 2026-10: esteticistas não possuem bônus — suppress é redundante, mas fica explícito.
    id: 'liria',
    aliases: ['liria pereira colman', 'liria pereira', 'liria colman', 'liria'],
    meioAMeioRate: null,
    assistantRemitRate: null,
    proCommissionRate: null,
    serviceTaxSplit: null,
    adminFeeRate: 0.07,
    quinzenaMeta: null,
    hasQuinzenaMeta: false,
    isRomeuAssistant: false,
    suppressEsteticistaBonus: true,
  },
  {
    id: 'brunna',
    aliases: ['brunna fabricio da silva', 'brunna fabricio', 'brunna'],
    meioAMeioRate: null,
    assistantRemitRate: null,
    proCommissionRate: null,
    serviceTaxSplit: BRUNNA_TAX_SPLIT,
    adminFeeRate: 0.05,
    quinzenaMeta: null,
    hasQuinzenaMeta: false,
    isRomeuAssistant: false,
    suppressEsteticistaBonus: false,
  },
  {
    id: 'joanides',
    aliases: ['joanides mendes pontes junior', 'joanides mendes', 'joanides', 'joah'],
    meioAMeioRate: null,
    assistantRemitRate: null,
    proCommissionRate: null,
    serviceTaxSplit: BRUNNA_TAX_SPLIT,
    adminFeeRate: 0.05,
    quinzenaMeta: null,
    hasQuinzenaMeta: false,
    isRomeuAssistant: false,
    suppressEsteticistaBonus: false,
  },
  {
    id: 'marcela',
    aliases: ['marcela de araujo guedes', 'marcela araujo guedes', 'marcela guedes'],
    meioAMeioRate: null,
    assistantRemitRate: null,
    proCommissionRate: null,
    serviceTaxSplit: BRUNNA_TAX_SPLIT,
    adminFeeRate: 0.05,
    quinzenaMeta: null,
    hasQuinzenaMeta: false,
    isRomeuAssistant: false,
    suppressEsteticistaBonus: false,
  },
  {
    // Fopag IG: J = U×2%, W = U×3% (mesmo split Brunna), sem adm 5% sobre C.
    // U/V/W no assistente são conferência — líquido do assistente omite +V−W.
    id: 'gabriela_martins',
    aliases: [
      'gabriela martins da silva',
      'gabriela martins',
    ],
    meioAMeioRate: null,
    assistantRemitRate: null,
    proCommissionRate: null,
    serviceTaxSplit: BRUNNA_TAX_SPLIT,
    adminFeeRate: null,
    quinzenaMeta: null,
    hasQuinzenaMeta: false,
    isRomeuAssistant: false,
    suppressEsteticistaBonus: false,
  },
  {
    // Mesmo split 2%+3% da Gabriela Martins (Fopag IG Q2).
    id: 'graciele',
    aliases: [
      'graciele da silva santos',
      'graciele da silva',
      'graciele santos',
      'graciele',
    ],
    meioAMeioRate: null,
    assistantRemitRate: null,
    proCommissionRate: null,
    serviceTaxSplit: BRUNNA_TAX_SPLIT,
    adminFeeRate: null,
    quinzenaMeta: null,
    hasQuinzenaMeta: false,
    isRomeuAssistant: false,
    suppressEsteticistaBonus: false,
  },
  {
    // Time Brunna: J = charged_8123×2% (Fopag `2000*2%`), sem U na linha.
    // Coluna adm = taxa_adm_assistente; pay já neteia (não reabate).
    id: 'camila_ornelas',
    aliases: ['camila ornelas santos', 'camila ornelas'],
    meioAMeioRate: null,
    assistantRemitRate: null,
    proCommissionRate: null,
    serviceTaxSplit: BRUNNA_TAX_SPLIT,
    adminFeeRate: null,
    quinzenaMeta: null,
    hasQuinzenaMeta: false,
    isRomeuAssistant: false,
    suppressEsteticistaBonus: false,
  },
  {
    // Time Brunna: J = charged_8123×2% (Fopag `650*2%`).
    id: 'tatiana_moura',
    aliases: [
      'tatiana cristina dos santos moura',
      'tatiana cristina dos santos',
      'tatiana moura',
      'tatiana cristina',
    ],
    meioAMeioRate: null,
    assistantRemitRate: null,
    proCommissionRate: null,
    serviceTaxSplit: BRUNNA_TAX_SPLIT,
    adminFeeRate: null,
    quinzenaMeta: null,
    hasQuinzenaMeta: false,
    isRomeuAssistant: false,
    suppressEsteticistaBonus: false,
  },
  {
    // Time Brunna (RH 2026-10): multiplicador com split 2%+3%.
    id: 'patricia_aguiar',
    aliases: [
      'patricia aguiar pinto',
      'patricia aguiar',
      'patricia a pinto',
    ],
    meioAMeioRate: null,
    assistantRemitRate: null,
    proCommissionRate: null,
    serviceTaxSplit: BRUNNA_TAX_SPLIT,
    adminFeeRate: null,
    quinzenaMeta: null,
    hasQuinzenaMeta: false,
    isRomeuAssistant: false,
    suppressEsteticistaBonus: false,
  },
  {
    id: 'lucas_campos',
    aliases: ['lucas campos de macedo', 'lucas campos'],
    meioAMeioRate: null,
    assistantRemitRate: null,
    proCommissionRate: null,
    serviceTaxSplit: null,
    adminFeeRate: null,
    // Meta = faturado mês ano anterior × 1,14. Q1 cobra adm (BR 5%);
    // se bater no mês, Q2 isenta adm e devolve a adm da Q1 (dia 05).
    quinzenaMeta: null,
    hasQuinzenaMeta: true,
    isRomeuAssistant: false,
    suppressEsteticistaBonus: false,
  },
  {
    id: 'romeu_assistant',
    aliases: [
      'jefferson policarpo dos santos',
      'jefferson policarpo',
      'jeferson policarto',
      'gabriela da silva santos',
      'gabriela santos',
      'lucas rodrigues de souza',
      'lucas rodrigues',
      'nicole moura de oliveira',
      'nicole moura',
      'pedro henrique sousa cardi',
      'pedro cardi',
      'jonathan dias dos santos',
      'jonathan dias',
    ],
    meioAMeioRate: null,
    assistantRemitRate: null,
    proCommissionRate: null,
    serviceTaxSplit: null,
    adminFeeRate: null,
    quinzenaMeta: null,
    hasQuinzenaMeta: false,
    isRomeuAssistant: true,
    suppressEsteticistaBonus: false,
  },
  {
    // Base Folha BR Q2: Y = G − J + V − W − diversos, com V = U×30% (earn).
    // Diferente de Eliseu/Marcelo (U/V/W só conferência). Paridade de catálogo.
    // Sem apelido de primeiro nome: IG "Auricaliane Dantas Da Silva" é outra
    // pessoa e o match por prefixo herdaria assistantEarnInPay.
    id: 'auricaliane',
    aliases: ['auricaliane da silva dantas'],
    meioAMeioRate: null,
    assistantRemitRate: null,
    proCommissionRate: null,
    serviceTaxSplit: null,
    adminFeeRate: null,
    quinzenaMeta: null,
    hasQuinzenaMeta: false,
    isRomeuAssistant: false,
    suppressEsteticistaBonus: false,
    assistantEarnInPay: true,
  },
]

/** Faixas de comissão dos assistentes do Romeu (acumulado mensal). */
export const ROMEU_ASSISTANT_BANDS: readonly {
  minInclusive: number
  maxInclusive: number
  rate: number
}[] = [
  { minInclusive: 1000, maxInclusive: 10_000, rate: 0.3 },
  { minInclusive: 10_001, maxInclusive: 20_000, rate: 0.4 },
  { minInclusive: 20_001, maxInclusive: 30_000, rate: 0.5 },
]

/**
 * Taxa adm default IG quando o assistente atua como profissional (sobre U).
 * BR usa 2% — ver {@link resolveAssistantAdminTaxRate}.
 */
export const ASSISTANT_AS_PRO_ADMIN_TAX = 0.03

/** Taxa adm default BR sobre U (Fopag Av. Brasil: J = T×2%). */
export const BR_ASSISTANT_AS_PRO_ADMIN_TAX = 0.02

/** @deprecated use ASSISTANT_AS_PRO_ADMIN_TAX — mantido como alias. */
export const IG_NON_ROMEU_ASSISTANT_ADMIN_TAX = ASSISTANT_AS_PRO_ADMIN_TAX

function aliasKeys(aliases: readonly string[]): string[] {
  return aliases.map((a) => occupancyMergeKey(a)).filter(Boolean)
}

/**
 * Resolve regras nomeadas. Preferência: match mais específico (alias mais longo).
 * "Walter Junior" não casa com Walter Leal (alias "walter" só se tokens[0]==walter
 * e não houver segundo token conflitante — usamos prefixo/igualdade de chave).
 */
export function resolveFolhaPersonRules(
  name: string | null | undefined,
): FolhaPersonRules | null {
  if (!name?.trim()) return null
  const key = occupancyMergeKey(name)
  if (!key) return null

  let best: FolhaPersonRules | null = null
  let bestLen = -1

  for (const rule of FOLHA_NAMED_EXCEPTIONS) {
    for (const alias of aliasKeys(rule.aliases)) {
      if (!alias) continue
      // Walter Leal ≠ Walter Junior.
      if (rule.id === 'walter_leal' && /\bjunior\b/.test(key)) continue
      const hit =
        key === alias ||
        key.startsWith(`${alias} `) ||
        // Apelido curto só se for o primeiro (e único significativo) token.
        (alias.split(' ').length === 1 && key.split(' ')[0] === alias && key === alias)
      if (!hit) continue
      if (alias.length > bestLen) {
        best = rule
        bestLen = alias.length
      }
    }
  }
  return best
}

/** Taxa de meio a meio efetiva para o profissional. */
export function resolveMeioAMeioRate(rules: FolhaPersonRules | null): number {
  if (rules?.assistantRemitRate != null) {
    return 1 - rules.assistantRemitRate
  }
  if (rules?.meioAMeioRate != null) return rules.meioAMeioRate
  return MEIO_A_MEIO_RATE
}

/**
 * Bônus esteticista. RH 2026-10: esteticistas **não** possuem bônus.
 * Sempre null (constante legada mantida só para referência histórica).
 */
export function resolveEsteticistaBonusRate(
  cargo: FolhaCargo,
  rules: FolhaPersonRules | null,
): number | null {
  void cargo
  void rules
  void ESTETICISTA_BONUS_RATE
  return null
}

/** Pedro/Dayana/Gildenice: Fopag fórmula meio=50% genérica — motor manda 5%. */
export function usesNamedMeioOverride(rules: FolhaPersonRules | null): boolean {
  return (
    rules?.id === 'pedro_diello' ||
    rules?.id === 'dayana' ||
    rules?.id === 'gildenice'
  )
}

/**
 * Taxa adm sobre faturado bruto (C).
 * BR 5% / IG 7%. Únicas IG a 5%: Brunna / Joanides / Marcela.
 */
export function resolveGrossAdminFeeRate(
  panel: RomPanelId,
  cargo: FolhaCargo,
  rules: FolhaPersonRules | null,
): number | null {
  if (rules?.adminFeeRate != null) return rules.adminFeeRate
  return defaultAdminFeeRate(panel, cargo)
}

/**
 * Alíquota W (taxa serviços no profissional) sobre U.
 * Brunna/Joanides/Marcela: 3% (do split 2%+3%).
 * Demais: default do painel (BR 3% / IG 4%).
 */
export function resolveProfessionalServiceTaxRate(
  panel: RomPanelId,
  rules: FolhaPersonRules | null,
): number {
  if (rules?.serviceTaxSplit) return rules.serviceTaxSplit.professional
  return assistantServiceTaxRate(panel)
}

/**
 * Alíquota adm do assistente sobre o montante do serviço que ele executou como pro (U).
 * - Brunna trio / time: 2% (split).
 * - BR (Fopag Av. Brasil): **2%** sobre U (fórmula J = T×2%).
 * - IG default (incl. Romeu): **3%** sobre U.
 */
export function resolveAssistantAdminTaxRate(
  panel: RomPanelId,
  rules: FolhaPersonRules | null,
): number | null {
  if (rules?.serviceTaxSplit) return rules.serviceTaxSplit.assistant
  if (panel === 'brasil') return BR_ASSISTANT_AS_PRO_ADMIN_TAX
  return ASSISTANT_AS_PRO_ADMIN_TAX
}

/**
 * Alíquota-base já paga nas quinzenas (Serviços 30% / Avec) quando o mês
 * de serviços Romeu (soma U Q1+Q2) passa de R$ 1.000.
 */
export const ROMEU_ASSISTANT_BASE_RATE = 0.3

/**
 * Comissão progressiva do assistente do Romeu pelo acumulado do mês
 * (soma U Romeu Q1+Q2 — Serviços 30%, não o faturado bruto).
 * Fora das faixas ( &lt; R$ 1.000 ) → null (não inventa 0).
 * Acima de R$ 30.000 → mantém 50%.
 */
export function romeuAssistantCommissionRate(
  monthAccumulated: number | null | undefined,
): number | null {
  if (monthAccumulated == null || Number.isNaN(monthAccumulated)) return null
  if (monthAccumulated < 1000) return null
  if (monthAccumulated > 30_000) return 0.5
  for (const band of ROMEU_ASSISTANT_BANDS) {
    if (monthAccumulated >= band.minInclusive && monthAccumulated <= band.maxInclusive) {
      return band.rate
    }
  }
  return null
}

/**
 * Adicional de meta Romeu pago **uma vez** no dia 05 (2ª quinzena / Q2).
 *
 * Racional (aba Bonus): todo mundo já inicia em 30% quando mês &gt; R$ 1.000;
 * esses 30% já foram pagos nas quinzenas. No dia 05 paga-se só o **top-up**
 * por ter batido faixa maior:
 * - [1000, 10000] → 30%, top-up 0
 * - (10000, 20000] → 40%, top-up = 10% do mês
 * - (20000, 30000] → 50%, top-up = 20% do mês
 * - &gt;30000 → 50%, top-up = 20% do mês
 *
 * `topUp = monthTotal × (rate − 0.30)` quando rate &gt; 0.30; senão 0.
 * null se acumulado ausente ou &lt; 1000.
 */
export function romeuAssistantMetaTopUp(
  monthTotal: number | null | undefined,
): { rate: number | null; monthTotal: number | null; topUp: number | null } {
  const rate = romeuAssistantCommissionRate(monthTotal)
  if (rate == null || monthTotal == null) {
    return { rate: null, monthTotal: null, topUp: null }
  }
  const topUp =
    rate > ROMEU_ASSISTANT_BASE_RATE
      ? monthTotal * (rate - ROMEU_ASSISTANT_BASE_RATE)
      : 0
  return { rate, monthTotal, topUp }
}

/**
 * @deprecated use {@link romeuAssistantMetaTopUp}. O modelo antigo
 * `parcel = (acumulado × rate) / 2` estava errado frente à aba Bonus.
 */
export function romeuAssistantPaySplit(
  monthAccumulated: number | null | undefined,
): { rate: number | null; monthTotal: number | null; topUp: number | null } {
  return romeuAssistantMetaTopUp(monthAccumulated)
}

/** Remessa V/U padrão (20%), sem override nomeado hoje. */
export function resolveRemitRate(rules: FolhaPersonRules | null): number {
  void rules
  return ASSISTANT_AS_PRO_REMIT_RATE
}

/** Ganho do assistente atuando como pro — default 30%; Romeu usa faixa progressiva. */
export function resolveAssistantEarnRate(
  rules: FolhaPersonRules | null,
  monthAccumulated?: number | null,
): number | null {
  if (rules?.isRomeuAssistant) {
    return romeuAssistantCommissionRate(monthAccumulated ?? null)
  }
  if (rules?.assistantRemitRate != null) return rules.assistantRemitRate
  return ASSISTANT_AS_PRO_EARN_RATE
}

/**
 * Crescimento YoY da meta do Lucas Campos: +14% sobre o faturado do mesmo
 * mês do ano anterior.
 */
export const LUCAS_CAMPOS_META_YOY_GROWTH = 0.14

/**
 * Alvo da meta (Lucas): `faturado_ano_anterior × 1,14`, ou `quinzenaMeta`
 * absoluto se preenchido.
 */
export function resolveQuinzenaMetaTarget(
  rules: FolhaPersonRules | null,
  priorYearMonthFaturado: number | null | undefined,
): number | null {
  if (!rules?.hasQuinzenaMeta) return null
  if (rules.quinzenaMeta != null) return rules.quinzenaMeta
  if (rules.id !== 'lucas_campos') return null
  if (
    priorYearMonthFaturado == null ||
    Number.isNaN(priorYearMonthFaturado) ||
    priorYearMonthFaturado < 0
  ) {
    return null
  }
  // Evita float 10000*1.14 → 11400.000000000002 (quebrava >=).
  const growthBp = Math.round(LUCAS_CAMPOS_META_YOY_GROWTH * 100)
  return (priorYearMonthFaturado * (100 + growthBp)) / 100
}

/**
 * Meta mensal (Lucas Campos).
 * RH: se o faturado do mês (Q1+Q2) ≥ meta → na Q2 (dia 05) não cobra taxa adm
 * e devolve a taxa adm cobrada na Q1.
 */
export function quinzenaMetaHit(
  rules: FolhaPersonRules | null,
  realizedMonthFaturado: number | null | undefined,
  priorYearMonthFaturado?: number | null,
): boolean | null {
  if (!rules?.hasQuinzenaMeta) return null
  const target = resolveQuinzenaMetaTarget(rules, priorYearMonthFaturado)
  if (target == null || realizedMonthFaturado == null) return null
  return realizedMonthFaturado >= target
}

/**
 * Crédito na Q2 quando a meta bate: devolução da taxa adm da Q1.
 * null se não é Q2, meta não bateu, ou taxa Q1 ausente.
 */
export function lucasCamposAdminRefundQ2(args: {
  rules: FolhaPersonRules | null
  isQ2: boolean
  metaHit: boolean | null
  taxaAdmQ1: number | null | undefined
}): number | null {
  if (args.rules?.id !== 'lucas_campos') return null
  if (!args.isQ2 || args.metaHit !== true) return null
  if (args.taxaAdmQ1 == null || Number.isNaN(args.taxaAdmQ1)) return null
  return args.taxaAdmQ1
}
