import { describe, expect, it } from 'vitest'
import {
  extractCnpjFromText,
  isUsableFolhaTaxCnpj,
  legalNameToMatchQuery,
  lookupFolhaTaxCnpjMaster,
  normalizeCnpjDigits,
  resolveFolhaTaxLineName,
} from '@/lib/folha/tax-cnpj'

describe('normalizeCnpjDigits / isUsableFolhaTaxCnpj', () => {
  it('normaliza máscara', () => {
    expect(normalizeCnpjDigits('23.225.433/0001-40')).toBe('23225433000140')
  })

  it('rejeita filial 0000 (placeholder)', () => {
    expect(isUsableFolhaTaxCnpj('61450000000000')).toBe(false)
  })

  it('aceita CNPJ válido da base', () => {
    expect(isUsableFolhaTaxCnpj('23225433000140')).toBe(true)
  })
})

describe('extractCnpjFromText', () => {
  it('pega CNPJ mascarado no corpo do DARF', () => {
    const text = `
      Documento de Arrecadação
      CNPJ: 23.225.433/0001-40
      Valor: R$ 178,31
    `
    expect(extractCnpjFromText(text)).toBe('23225433000140')
  })

  it('ignora placeholder 0000', () => {
    expect(extractCnpjFromText('CNPJ 61.450.000/0000-00')).toBeNull()
  })
})

describe('lookupFolhaTaxCnpjMaster', () => {
  it('acha razão social', () => {
    const e = lookupFolhaTaxCnpjMaster('23225433000140')
    expect(e?.legalName).toMatch(/ALBERTO/i)
    expect(e?.firm).toBe('YAMADA')
  })
})

describe('legalNameToMatchQuery', () => {
  it('remove LTDA / CABELEIREIRA', () => {
    expect(
      legalNameToMatchQuery('ANA CRISTINA MATSUMOTO CABELEIREIRA'),
    ).toBe('ANA CRISTINA MATSUMOTO')
  })

  it('remove CPF colado', () => {
    expect(legalNameToMatchQuery('GIOVANNA BUDOIA CASSIMIRO 44587265870')).toBe(
      'GIOVANNA BUDOIA CASSIMIRO',
    )
  })
})

describe('resolveFolhaTaxLineName', () => {
  const lines = [
    'Alberto Do Nascimento Tavares',
    'Ana Cristina Matsumoto',
    'Brunna Silva',
    'Maria Gabriela dos Santos',
  ]

  it('CNPJ da base → linha Folha', () => {
    expect(
      resolveFolhaTaxLineName({
        lineNames: lines,
        cnpj: '23.225.433/0001-40',
      }),
    ).toBe('Alberto Do Nascimento Tavares')
  })

  it('CNPJ com razão social + sufixo → limpa e casa', () => {
    const hit = resolveFolhaTaxLineName({
      lineNames: lines,
      cnpj: '27.667.980/0001-37',
    })
    expect(hit).toBe('Ana Cristina Matsumoto')
  })

  it('alias curado (razão social ≠ Folha)', () => {
    expect(
      resolveFolhaTaxLineName({
        lineNames: [...lines, 'Alison Alvarez'],
        cnpj: '14.435.894/0001-57',
      }),
    ).toBe('Alison Alvarez')
  })

  it('exact vence loose via CNPJ', () => {
    expect(
      resolveFolhaTaxLineName({
        lineNames: [...lines, 'Mauri Lima', 'Mauricio De Carvalho Lima'],
        cnpj: '31.003.229/0001-03',
      }),
    ).toBe('Mauricio De Carvalho Lima')
  })

  it('sem CNPJ: fallback iniciais', () => {
    expect(
      resolveFolhaTaxLineName({
        lineNames: lines,
        professionalName: 'M. G. DOS SANTOS',
      }),
    ).toBe('Maria Gabriela dos Santos')
  })

  it('CNPJ sem hit na Folha → cai no nome do PDF', () => {
    expect(
      resolveFolhaTaxLineName({
        lineNames: lines,
        cnpj: '11.106.752/0001-58', // Albuquerque LTDA — sem linha
        professionalName: 'B. Silva',
      }),
    ).toBe('Brunna Silva')
  })

  it('nada casa → null', () => {
    expect(
      resolveFolhaTaxLineName({
        lineNames: lines,
        cnpj: '11.106.752/0001-58',
        professionalName: 'Z. Inexistente',
      }),
    ).toBeNull()
  })
})
