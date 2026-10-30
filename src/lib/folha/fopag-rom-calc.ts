/**
 * Motor FOPAG ROM — especificação das apresentações RH (PDF + infográfico +
 * Planilha Base, 27/10/2026 @Rodrigo).
 *
 * Automático (IA) — passos 1 a 6:
 *   FL = R_0123 − [(R_0123 − R_041)×%salão + R_041×5%] − R_029
 *   LP = FL − R_026 − 50%×R_029
 *
 * Planilha Base traz a alíquota do **profissional**. Na fórmula do PDF a
 * dedução do passo 3 é a comissão do **salão** = 1 − alíquota do pro
 * (no exemplo 50%/50% coincidem). Assim Romeu 100% e Brunna 70% fecham.
 *
 * Manual (não calculado aqui): passo 7 (0186), ZIG/Baru, impostos,
 * adiantamento, campanhas e regras variáveis da Parte 3.
 *
 * KPI ausente = null (não inventa 0).
 */

export const FOPAG_ROM_PRODUCT_TAX_RATE = 0.05
export const FOPAG_ROM_MEIO_A_MEIO_RATE = 0.5

export type FopagRomAvecInputs = {
  /** AVEC 0123 / 8123 — faturamento bruto (serviços + produtos). */
  report0123: number | null
  /** AVEC 041 — produtos vendidos (bruto). */
  report041: number | null
  /** AVEC 029 — taxa de cartão (valor absoluto). */
  report029: number | null
  /** AVEC 026 — produto consumido (valor absoluto). */
  report026: number | null
  /**
   * Alíquota do profissional (Planilha Base RH), ex. 0.5 / 0.7 / 1.
   * null → não calcula (sem inventar %).
   */
  comissaoProfissional: number | null
}

export type FopagRomCalcResult = {
  servicoBruto: number | null
  comissaoSalao: number | null
  taxaProdutos: number | null
  resultadoPasso3: number | null
  /** Passos 1–4. */
  fatLiquido: number | null
  produtoConsumido: number | null
  /** Passo 6: 50% × R_029 (PDF). */
  meioAMeio: number | null
  /**
   * Líquido padrão após passos 1–6 (antes do passo 7 e manuais).
   * null se faltar base Avec ou alíquota.
   */
  liquidoPadrao: number | null
}

function present(v: number | null | undefined): v is number {
  return v != null && !Number.isNaN(v)
}

function mag(v: number | null | undefined): number | null {
  if (!present(v)) return null
  return Math.abs(v)
}

/**
 * Faturamento líquido do profissional (passos 1–4).
 * % na dedução = comissão do salão = 1 − comissão do profissional.
 */
export function computeFopagRomFatLiquido(
  input: FopagRomAvecInputs,
): Pick<
  FopagRomCalcResult,
  'servicoBruto' | 'comissaoSalao' | 'taxaProdutos' | 'resultadoPasso3' | 'fatLiquido'
> {
  const bruto = input.report0123
  const produtos = input.report041
  const cartao = mag(input.report029)
  const ratePro = input.comissaoProfissional

  if (!present(bruto) || !present(produtos) || !present(ratePro)) {
    return {
      servicoBruto: present(bruto) && present(produtos) ? bruto - produtos : null,
      comissaoSalao: null,
      taxaProdutos: present(produtos) ? produtos * FOPAG_ROM_PRODUCT_TAX_RATE : null,
      resultadoPasso3: null,
      fatLiquido: null,
    }
  }

  const servicoBruto = bruto - produtos
  const comissaoSalaoRate = 1 - ratePro
  const comissaoSalao = servicoBruto * comissaoSalaoRate
  const taxaProdutos = produtos * FOPAG_ROM_PRODUCT_TAX_RATE
  const resultadoPasso3 = bruto - (comissaoSalao + taxaProdutos)
  // Sem 029 no snapshot → não inventa taxa; trata como 0 (só serviços/produtos).
  const fatLiquido = resultadoPasso3 - (cartao ?? 0)

  return {
    servicoBruto,
    comissaoSalao,
    taxaProdutos,
    resultadoPasso3,
    fatLiquido,
  }
}

/**
 * Passos 1–6 (IA). Passo 7 e manuais ficam de fora.
 */
export function calculateFopagRom(input: FopagRomAvecInputs): FopagRomCalcResult {
  const part1 = computeFopagRomFatLiquido(input)
  const produtoConsumido = mag(input.report026)
  const cartao = mag(input.report029)
  // PDF passo 6: 50% × R_029; sem 029 → meio 0.
  const meioAMeio = (cartao ?? 0) * FOPAG_ROM_MEIO_A_MEIO_RATE

  if (part1.fatLiquido == null) {
    return {
      ...part1,
      produtoConsumido,
      meioAMeio: cartao == null ? null : meioAMeio,
      liquidoPadrao: null,
    }
  }

  let liquido = part1.fatLiquido
  if (present(produtoConsumido)) liquido -= produtoConsumido
  liquido -= meioAMeio

  return {
    ...part1,
    produtoConsumido,
    meioAMeio,
    liquidoPadrao: liquido,
  }
}

/**
 * Aplica só inclusões manuais (após passo 6). Null não move a conta.
 * Sinais: débitos positivos abatem; créditos (bonus0186, campanhas) somam.
 */
export function applyFopagRomManualExtras(
  liquidoPadrao: number | null,
  extras: {
    /** Passo 7 — débito (quem devolve). */
    servicoAssistenteDebito?: number | null
    /** Passo 7 — crédito/bônus (quem recebe). */
    servicoAssistenteBonus?: number | null
    consumoBaru?: number | null
    darf?: number | null
    das?: number | null
    mensalidade?: number | null
    parc?: number | null
    divAtiva?: number | null
    descontosDiversos?: number | null
    adiantamento?: number | null
    campanhas?: number | null
    /** Parte 3 — lançamentos manuais diversos (Luisa +1%, etc.). */
    regrasVariaveis?: number | null
  },
): number | null {
  if (liquidoPadrao == null) return null
  let y = liquidoPadrao
  const sub = (v: number | null | undefined) => {
    if (v == null || Number.isNaN(v)) return
    y -= Math.abs(v)
  }
  const add = (v: number | null | undefined) => {
    if (v == null || Number.isNaN(v)) return
    y += v
  }
  sub(extras.servicoAssistenteDebito)
  add(extras.servicoAssistenteBonus)
  sub(extras.consumoBaru)
  sub(extras.darf)
  sub(extras.das)
  sub(extras.mensalidade)
  sub(extras.parc)
  sub(extras.divAtiva)
  sub(extras.descontosDiversos)
  sub(extras.adiantamento)
  add(extras.campanhas)
  add(extras.regrasVariaveis)
  return y
}

export function roundFopagRom(value: number | null, digits = 4): number | null {
  if (value == null) return null
  const f = 10 ** digits
  return Math.round(value * f) / f
}
