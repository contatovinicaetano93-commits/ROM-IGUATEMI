import { describe, expect, it } from 'vitest'
import { parseBrlAmount, parseFolhaTaxEmail, taxKindToExtrasKey } from '@/lib/folha/tax-parse'

describe('parseBrlAmount', () => {
  it('aceita R$ com milhar e vírgula', () => {
    expect(parseBrlAmount('Valor: R$ 1.234,56')).toBe(1234.56)
  })

  it('ausente → null', () => {
    expect(parseBrlAmount('sem valor')).toBeNull()
  })
})

describe('parseFolhaTaxEmail', () => {
  it('detecta DARF + valor + profissional', () => {
    const parsed = parseFolhaTaxEmail({
      subject: 'DARF disponível',
      body: 'Profissional: Alan Fernando de Albuquerque\nDARF no valor de R$ 178,31',
    })
    expect(parsed.kind).toBe('darf')
    expect(parsed.amount).toBe(178.31)
    expect(parsed.professional_name).toMatch(/Alan/i)
    expect(taxKindToExtrasKey(parsed.kind)).toBe('darf')
  })

  it('detecta DAS', () => {
    const parsed = parseFolhaTaxEmail({
      body: 'Guia DAS Simples Nacional R$ 86,05',
    })
    expect(parsed.kind).toBe('das')
    expect(parsed.amount).toBe(86.05)
  })

  it('detecta mensalidade contábil + valor + profissional', () => {
    const parsed = parseFolhaTaxEmail({
      subject: 'Mensalidade Contabilidade',
      body: 'Profissional: Brunna Silva\nMensalidade contábil no valor de R$ 250,00',
    })
    expect(parsed.kind).toBe('mensalidade')
    expect(parsed.amount).toBe(250)
    expect(parsed.professional_name).toMatch(/Brunna/i)
    expect(taxKindToExtrasKey(parsed.kind)).toBe('mensalidade_contabilidade')
  })

  it('pega valor e nome no PDF/arquivo quando o assunto é genérico', () => {
    const parsed = parseFolhaTaxEmail({
      subject: 'Documento disponível',
      body: 'Documento de Arrecadação de Receitas Federais\nDARF no valor de R$ 178,31',
      filenames: ['M. G. DOS SANTOS - DARF INSS - AGO26.pdf'],
    })
    expect(parsed.kind).toBe('darf')
    expect(parsed.amount).toBe(178.31)
    expect(parsed.professional_name).toMatch(/SANTOS/i)
  })

  it('extrai CNPJ do corpo (DARF)', () => {
    const parsed = parseFolhaTaxEmail({
      subject: 'DARF disponível',
      body:
        'CNPJ: 23.225.433/0001-40\nProfissional: Alberto\nDARF no valor de R$ 178,31',
    })
    expect(parsed.kind).toBe('darf')
    expect(parsed.cnpj).toBe('23225433000140')
    expect(parsed.confidence).toBe('high')
  })
})
