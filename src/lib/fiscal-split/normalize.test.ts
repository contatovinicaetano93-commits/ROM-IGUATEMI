import { describe, expect, it } from 'vitest'
import { todayIso } from '@/lib/salon/format'
import {
  asNumber,
  maskFiscalPayloadForLog,
  normalizeSplitSettlement,
  normalizeSplitSettlementBatch,
} from './normalize'

describe('asNumber', () => {
  it('parseia decimal API e formatos BR', () => {
    expect(asNumber('250.00')).toBe(250)
    expect(asNumber('1250,50')).toBe(1250.5)
    expect(asNumber('1.250,50')).toBe(1250.5)
    expect(asNumber(12.5)).toBe(12.5)
  })
})

describe('normalizeSplitSettlement', () => {
  it('normaliza informe de segregação com campos oficiais RFB/CGIBS', () => {
    const result = normalizeSplitSettlement({
      idRepasse: 'ABC1234567890123PXD00000000001',
      arrj: 'PXD',
      e2eId: 'E2E123',
      docFiscal: 'NFSE-1001',
      vlPago: '250.00',
      vlCbsSegr: '12.50',
      vlIbsSegr: '7.50',
      dtHrPgto: '2026-07-16T14:30:00-03:00',
    })

    expect(result).toMatchObject({
      operationId: 'ABC1234567890123PXD00000000001',
      arrangement: 'PXD',
      docFiscal: 'NFSE-1001',
      paidAmount: 250,
      cbsAmount: 12.5,
      ibsAmount: 7.5,
      netAmount: 230,
      status: 'settled',
      settledAt: '2026-07-16',
    })
  })

  it('usa e2eId quando idRepasse ausente e fallback de data para hoje', () => {
    const result = normalizeSplitSettlement({
      e2eId: 'E2E999',
      vlPago: 100,
      vlCbsInf: 5,
      vlIbsInf: 3,
    })
    expect(result?.operationId).toBe('E2E999')
    expect(result?.cbsAmount).toBe(5)
    expect(result?.ibsAmount).toBe(3)
    expect(result?.netAmount).toBe(92)
    expect(result?.settledAt).toBe(todayIso())
  })

  it('parseia valores monetários em formato BR', () => {
    const result = normalizeSplitSettlement({
      e2eId: 'E2E-BR',
      vlPago: '1.250,50',
      vlCbsSegr: '62,50',
      vlIbsSegr: '37,50',
      settled_at: '2026-07-01',
    })
    expect(result).toMatchObject({
      paidAmount: 1250.5,
      cbsAmount: 62.5,
      ibsAmount: 37.5,
      netAmount: 1150.5,
    })
  })

  it('retorna null sem identificador de operação', () => {
    expect(normalizeSplitSettlement({ vlPago: 10 })).toBeNull()
  })

  it('normaliza lote e conta skipped implicitamente via batch size', () => {
    const batch = normalizeSplitSettlementBatch([
      { e2eId: 'A', vlPago: 10, vlCbsSegr: 1, vlIbsSegr: 1 },
      { vlPago: 20 },
      { txId: 'TX1', paid_amount: 30, cbs_amount: 2, ibs_amount: 1, settled_at: '2026-07-01' },
    ])
    expect(batch).toHaveLength(2)
    expect(batch[1]?.operationId).toBe('TX1')
  })

  it('mascara CNPJ/CPF em logs', () => {
    const masked = maskFiscalPayloadForLog({
      e2eId: 'E2E',
      cnpjRec: '12345678000199',
      cnpjCpfPagOrig: '12345678901',
    })
    expect(masked.cnpjRec).toBe('[redacted]')
    expect(masked.cnpjCpfPagOrig).toBe('[redacted]')
    expect(masked.e2eId).toBe('E2E')
  })
})
