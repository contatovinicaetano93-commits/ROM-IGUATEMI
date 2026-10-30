/**
 * Motor FOPAG ROM — especificação das apresentações RH (PDF + infográfico +
 * Planilha Base, 27/10/2026 @Rodrigo).
 *
 * Automático (IA) — passos 1 a 6 (taxa de cartão do 029):
 *   FL = R_0123 − [(R_0123 − R_041)×%salão + R_041×5%] − taxa_cartão_029
 *   LP = FL − R_026 − 50%×taxa_cartão_029
 *
 * Relatório 029 traz **duas** informações distintas:
 *   1) Desconto Assistente (total) → −K + 50%×K como crédito ao pro
 *   2) Taxa de cartão (débito + crédito) → entra nos passos 4 e 6 acima
 *
 * Planilha Base traz a alíquota do **profissional**. Na fórmula do PDF a
 * dedução do passo 3 é a comissão do **salão** = 1 − alíquota do pro
 * (no exemplo 50%/50% coincidem). Assim Romeu 100% e Brunna 70% fecham.
 *
 * Manual (não no LP padrão): passo 7 (0186 / U×20%), ZIG/Baru, impostos,
 * adiantamento, campanhas e regras variáveis da Parte 3. O desconto
 * assistente do 029 entra via `applyFopagRomManualExtras` (−K + meio).
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
  /**
   * AVEC 029 — **só** a taxa de cartão (débito+crédito), valor absoluto.
   * O desconto assistente do mesmo relatório NÃO entra aqui — ver
   * `descontoAssistente` em `applyFopagRomManualExtras`.
   */
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
  /** Passo 6: 50% × taxa de cartão do 029 (PDF). */
  meioAMeio: number | null
  /**
   * Líquido padrão após passos 1–6 (antes do assistente 029, passo 7 e manuais).
   * null se faltar base Avec ou alíquota.
   */
  liquidoPadrao: number | null
}

/**
 * Crédito meio a meio do desconto assistente (029).
 * Default 50%; exceções nomeadas (ex. Walter 60%) passam `rate`.
 */
export function meioAMeioAssistenteCredito(
  descontoAssistente: number | null | undefined,
  rate: number = FOPAG_ROM_MEIO_A_MEIO_RATE,
): number | null {
  const k = mag(descontoAssistente)
  if (k == null) return null
  return k * rate
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
 * Aplica desconto assistente do 029 + inclusões manuais (após passo 6).
 * Null não move a conta.
 *
 * Desconto Assistente (029): −K + (rate×K) crédito ao profissional
 * (padrão rate=50%; planilha Fopag: −K + L com L=K/2).
 *
 * Sinais demais: débitos positivos abatem; créditos (bonus0186, campanhas) somam.
 */
export function applyFopagRomManualExtras(
  liquidoPadrao: number | null,
  extras: {
    /**
     * 029 — Desconto Assistente (total). Motor: −K + meio×K.
     * Distinto da taxa de cartão (passos 4/6) e do passo 7 (0186).
     */
    descontoAssistente?: number | null
    /** Fração do desconto assistente creditada de volta (default 0.5). */
    meioAMeioAssistenteRate?: number | null
    /** Passo 7 — débito/taxa serviços W (quem devolve). */
    servicoAssistenteDebito?: number | null
    /** Passo 7 — crédito/bônus 0186 (quem recebe). */
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
    /** Top-up de meta Romeu já calculado no rascunho (Q2). Crédito. */
    romeuComissaoParcela?: number | null
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
  const k = mag(extras.descontoAssistente)
  if (k != null) {
    const rate =
      extras.meioAMeioAssistenteRate != null &&
      !Number.isNaN(extras.meioAMeioAssistenteRate)
        ? extras.meioAMeioAssistenteRate
        : FOPAG_ROM_MEIO_A_MEIO_RATE
    y -= k
    y += k * rate
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
  add(extras.romeuComissaoParcela)
  return y
}

export function roundFopagRom(value: number | null, digits = 4): number | null {
  if (value == null) return null
  const f = 10 ** digits
  return Math.round(value * f) / f
}
