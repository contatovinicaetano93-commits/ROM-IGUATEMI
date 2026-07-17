/** Arranjos previstos no Manual de Integração (RFB/CGIBS). */
export type FiscalArrangement = 'PXA' | 'PXD' | 'PXE' | 'BOL' | 'TED' | 'TEF' | string

export type FiscalSplitStatus = 'pending' | 'settled' | 'partial' | 'error'

/**
 * Payload bruto no formato da Plataforma Pública (campos do dicionário oficial).
 * Aceita também aliases em snake/camel case vindos de export do PSP.
 */
export interface FiscalSplitRawPayload {
  idRepasse?: string
  idInfSegr?: string
  idLote?: string
  e2eId?: string
  txId?: string
  arrj?: string
  docFiscal?: string
  vlPago?: number | string
  vlInf?: number | string
  vlCbsSegr?: number | string
  vlIbsSegr?: number | string
  vlCbsInf?: number | string
  vlIbsInf?: number | string
  vlCbsCorr?: number | string
  vlIbsCorr?: number | string
  dtHrMsg?: string
  dtHrPgto?: string
  settled_at?: string
  operation_id?: string
  arrangement?: string
  paid_amount?: number | string
  cbs_amount?: number | string
  ibs_amount?: number | string
  status?: string
  [key: string]: unknown
}

export interface NormalizedFiscalSplit {
  operationId: string
  arrangement: FiscalArrangement | null
  docFiscal: string | null
  paidAmount: number
  cbsAmount: number
  ibsAmount: number
  netAmount: number
  status: FiscalSplitStatus
  settledAt: string | null
  rawPayload: Record<string, unknown>
}

export interface FiscalSplitRecord {
  id: string
  operation_id: string
  arrangement: string | null
  doc_fiscal: string | null
  paid_amount: number
  cbs_amount: number
  ibs_amount: number
  net_amount: number
  status: FiscalSplitStatus
  source: string
  settled_at: string | null
  imported_at: string
  updated_at: string
}

export interface FiscalSplitSummary {
  gross_paid: number
  cbs_retained: number
  ibs_retained: number
  net_received: number
  pending_count: number
  settled_count: number
  configured: boolean
}
