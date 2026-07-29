import { describe, expect, it } from 'vitest'
import { omieBrToIso, omieFullMonthRange, omieIsoToBr } from '@/lib/omie/dates'
import { normalizeOmieTitulo } from '@/lib/omie/sync'
import type { OmieTituloEncontrado } from '@/lib/omie/types'

describe('omie dates', () => {
  it('converte BR ↔ ISO', () => {
    expect(omieBrToIso('01/07/2026')).toBe('2026-07-01')
    expect(omieIsoToBr('2026-07-29')).toBe('29/07/2026')
    expect(omieBrToIso('ruim')).toBeNull()
  })

  it('monta mês cheio', () => {
    expect(omieFullMonthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(omieFullMonthRange('2024-02')).toEqual({ from: '2024-02-01', to: '2024-02-29' })
  })
})

describe('normalizeOmieTitulo', () => {
  const cats = new Map([['2.04.04', 'Energia Elétrica']])

  it('normaliza título pago com CNPJ serviços', () => {
    const titulo: OmieTituloEncontrado = {
      cabecTitulo: {
        nCodTitulo: 123,
        cStatus: 'PAGO',
        nValorTitulo: 249.5,
        dDtVenc: '10/07/2026',
        dDtEmissao: '01/07/2026',
        cCodCateg: '2.04.04',
        cNumDocFiscal: '334',
        cNumParcela: '001/001',
        cCPFCNPJCliente: '11.111.111/0001-11',
      },
    }
    const n = normalizeOmieTitulo(titulo, cats, 'Fornecedor X', 'servicos')
    expect(n?.externalId).toBe('123')
    expect(n?.amount).toBe(249.5)
    expect(n?.expenseDate).toBe('2026-07-10')
    expect(n?.categoryName).toBe('Energia Elétrica')
    expect(n?.description).toContain('Serviços (salão)')
    expect(n?.description).toContain('Fornecedor X')
    expect(n?.cnpjKind).toBe('servicos')
    expect(n?.status).toBe('PAGO')
  })

  it('marca cancelado sem valor útil', () => {
    const titulo: OmieTituloEncontrado = {
      cabecTitulo: {
        nCodTitulo: 9,
        cStatus: 'CANCELADO',
        nValorTitulo: 10,
        dDtVenc: '10/07/2026',
      },
    }
    const n = normalizeOmieTitulo(titulo, cats, null, 'comercio')
    expect(n?.status).toBe('CANCELADO')
    expect(n?.cnpjKind).toBe('comercio')
    expect(n?.amount).toBe(0)
  })
})
