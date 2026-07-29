/** Tipos da API Omie — Contas a Pagar / Pesquisar Títulos. */

export interface OmieCategoria {
  codigo: string
  descricao: string
  conta_despesa?: string
  conta_receita?: string
  conta_inativa?: string
  totalizadora?: string
}

export interface OmieTituloCabec {
  nCodTitulo: number
  cStatus: string
  nValorTitulo: number
  dDtVenc: string
  dDtEmissao?: string
  dDtPrevisao?: string
  cCodCateg?: string
  cNumDocFiscal?: string | null
  cNumDocumento?: string | null
  nCodCliente?: number
  cNumParcela?: string
  cCPFCNPJCliente?: string
  cNatureza?: string
}

export interface OmieTituloResumo {
  cLiquidado?: string
  nValPago?: number
  nValAberto?: number
  nValLiquido?: number
}

export interface OmieTituloEncontrado {
  cabecTitulo: OmieTituloCabec
  resumo?: OmieTituloResumo
}

export interface OmiePesquisarResponse {
  nPagina: number
  nTotPaginas: number
  nRegistros: number
  nTotRegistros: number
  titulosEncontrados?: OmieTituloEncontrado[]
  faultstring?: string
  code?: number | string
}

export interface OmieCategoriasResponse {
  pagina: number
  total_de_paginas: number
  registros: number
  total_de_registros: number
  categoria_cadastro?: OmieCategoria[]
  faultstring?: string
  code?: number | string
}

export interface OmieClienteResponse {
  codigo_cliente_omie?: number
  razao_social?: string
  nome_fantasia?: string
  cnpj_cpf?: string
  faultstring?: string
  code?: number | string
}

export interface OmieNormalizedExpense {
  externalId: string
  amount: number
  expenseDate: string
  description: string
  notes: string
  categoryName: string
  categoryCode: string | null
  status: string
  supplierName: string | null
}
