/**
 * Exceções nomeadas da Folha PJ — assistente / meio a meio / taxa U.
 *
 * Fontes: clarificações RH (chat 2026-10-01). KPI ausente = null.
 */

import { occupancyMergeKey } from '@/lib/director-report/match-pro'
import {
  ASSISTANT_AS_PRO_EARN_RATE,
  ASSISTANT_AS_PRO_REMIT_RATE,
  MEIO_A_MEIO_RATE,
  assistantServiceTaxRate,
  defaultAdminFeeRate,
  type FolhaCargo,
} from '@/lib/folha/rules'
import type { RomPanelId } from '@/lib/brand'

export type FolhaExceptionId =
  | 'pedro_diello'
  | 'dayana'
  | 'romeu'
  | 'walter_leal'
  | 'dani_rocha'
  | 'brunna'
  | 'joanides'
  | 'marcela'
  | 'lucas_campos'
  | 'juscelino'
  | 'romeu_assistant'

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
   * Default geral = 7% (BR e IG); Brunna/Joanides/Marcela = 5%. null = default do cargo.
   */
  adminFeeRate: number | null
  /**
   * Meta de faturamento para isentar 2ª quinzena + devolver 1ª (dia 05).
   * null = regra existe mas valor ainda não confirmado pelo RH.
   */
  quinzenaMeta: number | null
  hasQuinzenaMeta: boolean
  /** Assistente do Romeu — faixas progressivas 30/40/50. */
  isRomeuAssistant: boolean
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
  },
  {
    id: 'dayana',
    aliases: ['dayana marques silva pinto', 'dayana marques', 'dayana'],
    meioAMeioRate: 0.05,
    assistantRemitRate: null,
    proCommissionRate: null,
    serviceTaxSplit: null,
    adminFeeRate: null,
    quinzenaMeta: null,
    hasQuinzenaMeta: false,
    isRomeuAssistant: false,
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
  },
  {
    id: 'dani_rocha',
    aliases: ['daniela machado rocha', 'dani rocha', 'dani machado rocha'],
    meioAMeioRate: null,
    assistantRemitRate: 0.35,
    proCommissionRate: 0.55,
    serviceTaxSplit: null,
    adminFeeRate: null,
    quinzenaMeta: null,
    hasQuinzenaMeta: false,
    isRomeuAssistant: false,
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
  },
  {
    id: 'lucas_campos',
    aliases: ['lucas campos de macedo', 'lucas campos'],
    meioAMeioRate: null,
    assistantRemitRate: null,
    proCommissionRate: null,
    serviceTaxSplit: null,
    adminFeeRate: null,
    // Meta existe (pagamento dia 05); valor numérico ainda pendente de conferência RH.
    quinzenaMeta: null,
    hasQuinzenaMeta: true,
    isRomeuAssistant: false,
  },
  {
    id: 'juscelino',
    aliases: ['juscelino'],
    meioAMeioRate: null,
    assistantRemitRate: null,
    proCommissionRate: null,
    serviceTaxSplit: null,
    adminFeeRate: null,
    quinzenaMeta: null,
    hasQuinzenaMeta: true,
    isRomeuAssistant: false,
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
    ],
    meioAMeioRate: null,
    assistantRemitRate: null,
    proCommissionRate: null,
    serviceTaxSplit: null,
    adminFeeRate: null,
    quinzenaMeta: null,
    hasQuinzenaMeta: false,
    isRomeuAssistant: true,
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
 * Taxa adm quando o assistente atua como profissional (sobre o valor do serviço).
 * Vale para **todos** os assistentes (incl. Romeu) — BR e IG.
 */
export const ASSISTANT_AS_PRO_ADMIN_TAX = 0.03

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
 * Taxa adm sobre faturado bruto (C).
 * Regra geral BR + IG: 7%. Únicas a 5%: Brunna / Joanides / Marcela.
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
 * Alíquota adm do assistente sobre o montante do serviço que ele executou como pro.
 * Brunna trio: 2% (split). Demais assistentes (incl. Romeu), BR e IG: **3%**.
 */
export function resolveAssistantAdminTaxRate(
  _panel: RomPanelId,
  rules: FolhaPersonRules | null,
): number | null {
  if (rules?.serviceTaxSplit) return rules.serviceTaxSplit.assistant
  return ASSISTANT_AS_PRO_ADMIN_TAX
}

/**
 * Comissão progressiva do assistente do Romeu pelo acumulado do mês.
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
 * Delta do mês (acumulado × faixa) — pago metade dia 20 (Q1) e metade dia 05 (Q2).
 */
export function romeuAssistantPaySplit(
  monthAccumulated: number | null | undefined,
): { rate: number | null; monthCommission: number | null; parcel: number | null } {
  const rate = romeuAssistantCommissionRate(monthAccumulated)
  if (rate == null || monthAccumulated == null) {
    return { rate: null, monthCommission: null, parcel: null }
  }
  const monthCommission = monthAccumulated * rate
  return {
    rate,
    monthCommission,
    parcel: monthCommission / 2,
  }
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
 * Meta quinzenal (Lucas Campos / Juscelino): se bater no pagamento do dia 05,
 * isenta a 2ª quinzena e devolve a da 1ª. Valor null = pendente RH.
 */
export function quinzenaMetaHit(
  rules: FolhaPersonRules | null,
  realized: number | null | undefined,
): boolean | null {
  if (!rules?.hasQuinzenaMeta) return null
  if (rules.quinzenaMeta == null || realized == null) return null
  return realized >= rules.quinzenaMeta
}
