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

  it('alias Alan Folha FERNADO + Amaro → Luiza', () => {
    const roster = [
      ...lines,
      'ALAN FERNADO DE ALBUQUERQUE',
      'LUIZA ANTONIA AMARO PINTO',
    ]
    expect(
      resolveFolhaTaxLineName({
        lineNames: roster,
        cnpj: '11.106.752/0001-58',
      }),
    ).toBe('ALAN FERNADO DE ALBUQUERQUE')
    expect(
      resolveFolhaTaxLineName({
        lineNames: roster,
        cnpj: '43.931.990/0001-94',
      }),
    ).toBe('LUIZA ANTONIA AMARO PINTO')
  })

  it('alias Auxiliadora Alci Bella (IG)', () => {
    expect(
      resolveFolhaTaxLineName({
        lineNames: [
          ...lines,
          'Maria Auxiliadora Ribeiro Alves Alci Bella',
        ],
        cnpj: '07.038.057/0001-29',
      }),
    ).toBe('Maria Auxiliadora Ribeiro Alves Alci Bella')
  })

  it('strip MANICURE / MAQUIADOR / COMCEPT na razão social', () => {
    expect(legalNameToMatchQuery('AMARO MAKEUP LTDA')).toBe('AMARO')
    expect(
      legalNameToMatchQuery('DIANA DOS SANTOS BELEZA DAS MAOS MANICURE LTDA'),
    ).toBe('DIANA DOS SANTOS DAS MAOS')
    expect(legalNameToMatchQuery('D&G HAIR COMCEPT LTDA')).toBe('D&G')
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
