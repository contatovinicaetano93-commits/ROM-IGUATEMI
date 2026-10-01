/**
 * Regras da Folha PJ — fontes travadas:
 * - Caderno RH 17/11 (Folha de pagamento)
 * - Planilha Fopag (Av. Brasil / Iguatemi) — fórmulas das colunas
 * - Clarificações RH: serviços assistente-como-pro, manicure sem taxa adm,
 *   manter exceções da planilha
 *
 * Taxa 3% (BR) / 4% (IG) ≠ taxa de cartão.
 * Cartão/PIX fica na coluna F (2% débito / 3% crédito no Avec).
 * A taxa 3%/4% incide só sobre o montante U (serviços do fluxo
 * assistente atuando como profissional).
 */

import type { RomPanelId } from '@/lib/brand'

export type FolhaCargo =
  | 'profissional'
  | 'cabeleireiro'
  | 'maquiador'
  | 'manicure'
  | 'esteticista'
  | 'assistente'
  | 'multiplicador'
  | 'colorista'
  | 'outro'

/** Taxa sobre serviços do fluxo assistente→pro (coluna W = U × taxa). */
export function assistantServiceTaxRate(panel: RomPanelId): number {
  return panel === 'iguatemi' ? 0.04 : 0.03
}

/**
 * Fatia do montante U que vira “Valor a pagar profissional” (coluna V).
 * Planilha: V = U × 20% na maioria das linhas (BR e IG).
 * O rótulo IG “Serviços 30%” é a participação do assistente atuando como pro
 * (+ meio a meio), não a alíquota de V.
 */
export const ASSISTANT_AS_PRO_REMIT_RATE = 0.2

/** Assistente atuando como profissional: pode receber esta fatia do faturado. */
export const ASSISTANT_AS_PRO_EARN_RATE = 0.3

/** Meio a meio: metade do desconto assistente volta ao profissional. */
export const MEIO_A_MEIO_RATE = 0.5

/** Esteticista: bônus de 10% sobre o faturado total. */
export const ESTETICISTA_BONUS_RATE = 0.1

/**
 * Taxa administrativa padrão por cargo (quando o contrato não sobrescreve).
 * Caderno: “olhe os contratos”. Defaults batem com a moda da Fopag.
 */
export function defaultAdminFeeRate(
  panel: RomPanelId,
  cargo: FolhaCargo,
): number | null {
  switch (cargo) {
    case 'manicure':
      // Caderno: manicure sem taxa adm (salvo depilação).
      return null
    case 'assistente':
    case 'multiplicador':
    case 'colorista':
      // Assistente / multiplicador / colorista: em geral sem taxa adm sobre C;
      // quando há U, a planilha usa % sobre U (exceção por linha).
      return null
    case 'maquiador':
    case 'profissional':
    case 'cabeleireiro':
    case 'esteticista':
      return panel === 'iguatemi' ? 0.07 : 0.05
    case 'outro':
      return null
    default: {
      const _exhaustive: never = cargo
      return _exhaustive
    }
  }
}

export function normalizeFolhaCargo(raw: string | null | undefined): FolhaCargo {
  const s = (raw ?? '').trim().toLowerCase()
  if (!s) return 'outro'
  if (s.includes('manic')) return 'manicure'
  if (s.includes('maqui')) return 'maquiador'
  if (s.includes('estetic')) return 'esteticista'
  if (s.includes('assist')) return 'assistente'
  if (s.includes('multiplica')) return 'multiplicador'
  if (s.includes('color')) return 'colorista'
  if (s.includes('cabel') || s.includes('profissional')) return 'cabeleireiro'
  return 'outro'
}

export type FolhaRulesSummary = {
  panel: RomPanelId
  source: string
  assistant_service_tax_rate: number
  assistant_as_pro_remit_rate: number
  assistant_as_pro_earn_rate: number
  meio_a_meio_rate: number
  esteticista_bonus_rate: number
  manicure_admin_fee: 'never_unless_depilacao'
  card_fee_note: string
  cargo_notes: Record<FolhaCargo, string>
}

export function folhaRulesSummary(panel: RomPanelId): FolhaRulesSummary {
  return {
    panel,
    source: 'Caderno RH 17/11 + Fopag + clarificações RH',
    assistant_service_tax_rate: assistantServiceTaxRate(panel),
    assistant_as_pro_remit_rate: ASSISTANT_AS_PRO_REMIT_RATE,
    assistant_as_pro_earn_rate: ASSISTANT_AS_PRO_EARN_RATE,
    meio_a_meio_rate: MEIO_A_MEIO_RATE,
    esteticista_bonus_rate: ESTETICISTA_BONUS_RATE,
    manicure_admin_fee: 'never_unless_depilacao',
    card_fee_note:
      'Taxa cartão/PIX é coluna aparte (débito ~2% / crédito ~3%). Não confundir com a taxa 3%/4% sobre serviços U.',
    cargo_notes: {
      profissional:
        'Faturado − taxa adm − assistente − produto; 50% do desconto assistente volta (meio a meio).',
      cabeleireiro:
        'Faturado − taxa adm − assistente − produto; 50% do desconto assistente volta (meio a meio).',
      maquiador: 'Faturado − taxa adm − produto.',
      manicure:
        'Faturado − produto. Sem taxa adm — exceto quem tem depilação.',
      esteticista:
        'Faturado − taxa adm − produto; ganha 10% do total faturado.',
      assistente:
        'Faturado − produto. IG não-Romeu: ganho 30% com taxa adm 3%; profissional 4% sobre U + remessa V 20%. Assistentes do Romeu: faixas 30/40/50% no acumulado do mês (pago 05+20).',
      multiplicador:
        'Participação tipicamente 10–13% do faturado; taxa adm em geral só sobre serviços U quando aplicável.',
      colorista: 'Tratado como multiplicador/assistente na Fopag (sem taxa adm padrão sobre C).',
      outro: 'Sem default — exige contrato / exceção da planilha.',
    },
  }
}
