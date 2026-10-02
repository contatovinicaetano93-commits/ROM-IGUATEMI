/**
 * Motor puro da Folha PJ — espelha a fórmula Y da Fopag:
 * Y = fatLiquido − produto − taxaAdm − descAssist + meioAMeio
 *     − parc − darf − das − divAtiva − mensalidade − descontosDiversos
 *     − consumoBaru − produtosBlack + valorAPagarPro − taxaServicosU
 *
 * KPI ausente = null (não vira 0 falso). Só entra na conta quando informado.
 */

import type { RomPanelId } from '@/lib/brand'
import {
  resolveEsteticistaBonusRate,
  resolveFolhaPersonRules,
  resolveMeioAMeioRate,
  resolveProfessionalServiceTaxRate,
  resolveRemitRate,
  type FolhaPersonRules,
} from '@/lib/folha/exceptions'
import {
  defaultAdminFeeRate,
  normalizeFolhaCargo,
  type FolhaCargo,
} from '@/lib/folha/rules'

export type FolhaLineInput = {
  panel: RomPanelId
  /** Nome do profissional — resolve exceções (Pedro/Walter/Brunna…). */
  professionalName?: string | null
  cargo: string | null
  /** Faturado bruto (coluna C). */
  faturado: number | null
  /** % salão (coluna D), quando já resolvido do contrato. */
  pctSalao: number | null
  /** Fat. líquido do profissional (coluna G/H). Se null, deriva de faturado×(1−pct) − taxaCartao quando possível. */
  fatLiquido: number | null
  taxaCartaoPix: number | null
  produto: number | null
  /** Override explícito de taxa adm; se omitido, usa default do cargo. */
  taxaAdministrativa: number | null | undefined
  descontoAssistente: number | null
  /** Se null e há descontoAssistente, usa taxa nomeada / default 50%. */
  meioAMeio: number | null
  parc: number | null
  darf: number | null
  das: number | null
  divAtiva: number | null
  mensalidadeContabilidade: number | null
  descontosDiversos: number | null
  /** Consumo Baru (RH) — abate no Y. */
  consumoBaru?: number | null
  produtosBlack: number | null
  /**
   * Montante de serviços do fluxo assistente-como-pro (coluna U).
   * V e W derivam daqui, salvo override.
   */
  servicosAssistenteComoPro: number | null
  /** Override de V (valor a pagar profissional). */
  valorAPagarProfissional: number | null
  /** Override da alíquota V/U. */
  remitRateOverride: number | null
  /** Override de W. */
  taxaServicosOverride: number | null
  /** Manicure com depilação → passa a ter taxa adm. */
  hasDepilacao: boolean
  /** Exceção planilha: força taxa adm = 0. */
  waiveAdminFee: boolean
}

export type FolhaLineResult = {
  cargo: FolhaCargo
  fatLiquido: number | null
  taxaAdministrativa: number | null
  meioAMeio: number | null
  valorAPagarProfissional: number | null
  taxaServicos: number | null
  esteticistaBonus: number | null
  /** Valor líquido a pagar (coluna Y). null se falta fatLiquido. */
  valorLiquido: number | null
}

function n(v: number | null | undefined): number {
  return v == null || Number.isNaN(v) ? 0 : v
}

function resolveFatLiquido(input: FolhaLineInput): number | null {
  if (input.fatLiquido != null) return input.fatLiquido
  if (input.faturado == null || input.pctSalao == null) return null
  const retencao = input.faturado * input.pctSalao
  return input.faturado - retencao - n(input.taxaCartaoPix)
}

function resolveAdminFee(input: FolhaLineInput, cargo: FolhaCargo): number | null {
  if (input.waiveAdminFee) return null
  if (input.taxaAdministrativa !== undefined) {
    return input.taxaAdministrativa
  }
  // Caderno: manicure sem taxa adm — exceto quem tem depilação.
  if (cargo === 'manicure') {
    if (!input.hasDepilacao || input.faturado == null) return null
    const depilacaoRate = defaultAdminFeeRate(input.panel, 'cabeleireiro')
    if (depilacaoRate == null) return null
    return input.faturado * depilacaoRate
  }
  const rate = defaultAdminFeeRate(input.panel, cargo)
  if (rate == null || input.faturado == null) return null
  return input.faturado * rate
}

function personRules(input: FolhaLineInput): FolhaPersonRules | null {
  return resolveFolhaPersonRules(input.professionalName)
}

function resolveMeioAMeio(
  input: FolhaLineInput,
  rules: FolhaPersonRules | null,
): number | null {
  if (input.meioAMeio != null) return input.meioAMeio
  if (input.descontoAssistente == null) return null
  return input.descontoAssistente * resolveMeioAMeioRate(rules)
}

function resolveValorAPagarPro(
  input: FolhaLineInput,
  rules: FolhaPersonRules | null,
): number | null {
  if (input.valorAPagarProfissional != null) return input.valorAPagarProfissional
  if (input.servicosAssistenteComoPro == null) return null
  const rate = input.remitRateOverride ?? resolveRemitRate(rules)
  return input.servicosAssistenteComoPro * rate
}

function resolveTaxaServicos(
  input: FolhaLineInput,
  rules: FolhaPersonRules | null,
): number | null {
  if (input.taxaServicosOverride != null) return input.taxaServicosOverride
  if (input.servicosAssistenteComoPro == null) return null
  return (
    input.servicosAssistenteComoPro *
    resolveProfessionalServiceTaxRate(input.panel, rules)
  )
}

/**
 * Calcula a linha da folha. Ausências viram null nos campos derivados;
 * na soma do líquido, só valores presentes entram (null ≡ não abate/não soma).
 */
export function calculateFolhaLine(input: FolhaLineInput): FolhaLineResult {
  const cargo = normalizeFolhaCargo(input.cargo)
  const rules = personRules(input)
  const fatLiquido = resolveFatLiquido(input)
  const taxaAdministrativa = resolveAdminFee(input, cargo)
  const meioAMeio = resolveMeioAMeio(input, rules)
  const valorAPagarProfissional = resolveValorAPagarPro(input, rules)
  const taxaServicos = resolveTaxaServicos(input, rules)

  const esteticistaBonusRate = resolveEsteticistaBonusRate(cargo, rules)
  const esteticistaBonus =
    esteticistaBonusRate != null && input.faturado != null
      ? input.faturado * esteticistaBonusRate
      : null

  if (fatLiquido == null) {
    return {
      cargo,
      fatLiquido: null,
      taxaAdministrativa,
      meioAMeio,
      valorAPagarProfissional,
      taxaServicos,
      esteticistaBonus,
      valorLiquido: null,
    }
  }

  const valorLiquido =
    fatLiquido -
    n(input.produto) -
    n(taxaAdministrativa) -
    n(input.descontoAssistente) +
    n(meioAMeio) -
    n(input.parc) -
    n(input.darf) -
    n(input.das) -
    n(input.divAtiva) -
    n(input.mensalidadeContabilidade) -
    n(input.descontosDiversos) -
    n(input.consumoBaru) -
    n(input.produtosBlack) +
    n(valorAPagarProfissional) -
    n(taxaServicos) +
    n(esteticistaBonus)

  return {
    cargo,
    fatLiquido,
    taxaAdministrativa,
    meioAMeio,
    valorAPagarProfissional,
    taxaServicos,
    esteticistaBonus,
    valorLiquido,
  }
}

/** Atalho para testes / conferência Fopag: arredonda a 4 casas como a planilha. */
export function roundFolha(value: number | null, digits = 4): number | null {
  if (value == null) return null
  const f = 10 ** digits
  return Math.round(value * f) / f
}
