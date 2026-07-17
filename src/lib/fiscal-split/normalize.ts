import type { FiscalSplitRawPayload, FiscalSplitStatus, NormalizedFiscalSplit } from './types'

function asNumber(value: unknown): number {
  if (value == null || value === '') return 0
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'))
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}

function asText(value: unknown): string | null {
  if (value == null) return null
  const s = String(value).trim()
  return s ? s : null
}

function pickDate(payload: FiscalSplitRawPayload): string | null {
  const raw =
    asText(payload.settled_at) ??
    asText(payload.dtHrPgto) ??
    asText(payload.dtHrMsg) ??
    null
  if (!raw) return null
  // Aceita ISO completo ou YYYY-MM-DD.
  const day = raw.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null
}

function resolveOperationId(payload: FiscalSplitRawPayload): string | null {
  return (
    asText(payload.operation_id) ??
    asText(payload.idRepasse) ??
    asText(payload.e2eId) ??
    asText(payload.idInfSegr) ??
    asText(payload.txId) ??
    null
  )
}

function resolveStatus(payload: FiscalSplitRawPayload, cbs: number, ibs: number, paid: number): FiscalSplitStatus {
  const explicit = asText(payload.status)?.toLowerCase()
  if (explicit === 'pending' || explicit === 'settled' || explicit === 'partial' || explicit === 'error') {
    return explicit
  }
  const retained = cbs + ibs
  if (paid <= 0 && retained <= 0) return 'pending'
  if (retained > 0 && retained < paid) return 'settled'
  if (retained > 0) return 'settled'
  return 'partial'
}

/**
 * Normaliza um informe/settlement no formato da Plataforma Pública (ou export PSP)
 * para o modelo de conciliação do ROM.
 */
export function normalizeSplitSettlement(payload: FiscalSplitRawPayload): NormalizedFiscalSplit | null {
  const operationId = resolveOperationId(payload)
  if (!operationId) return null

  const paidAmount = asNumber(payload.vlPago ?? payload.paid_amount ?? payload.vlInf)
  const cbsAmount = asNumber(payload.vlCbsSegr ?? payload.cbs_amount ?? payload.vlCbsCorr ?? payload.vlCbsInf)
  const ibsAmount = asNumber(payload.vlIbsSegr ?? payload.ibs_amount ?? payload.vlIbsCorr ?? payload.vlIbsInf)
  const netAmount = Math.round((paidAmount - cbsAmount - ibsAmount) * 100) / 100

  return {
    operationId,
    arrangement: asText(payload.arrj ?? payload.arrangement),
    docFiscal: asText(payload.docFiscal),
    paidAmount,
    cbsAmount,
    ibsAmount,
    netAmount,
    status: resolveStatus(payload, cbsAmount, ibsAmount, paidAmount),
    settledAt: pickDate(payload),
    rawPayload: { ...payload },
  }
}

export function normalizeSplitSettlementBatch(
  payloads: FiscalSplitRawPayload[]
): NormalizedFiscalSplit[] {
  const out: NormalizedFiscalSplit[] = []
  for (const payload of payloads) {
    const normalized = normalizeSplitSettlement(payload)
    if (normalized) out.push(normalized)
  }
  return out
}

/** Remove campos sensíveis antes de logar (CNPJ/CPF). */
export function maskFiscalPayloadForLog(payload: Record<string, unknown>): Record<string, unknown> {
  const masked = { ...payload }
  for (const key of Object.keys(masked)) {
    const lower = key.toLowerCase()
    if (lower.includes('cnpj') || lower.includes('cpf')) {
      masked[key] = '[redacted]'
    }
  }
  return masked
}
